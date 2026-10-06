import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../shared/db/client.js";
import { companyPolicies, departments, designations, employeeLetters, employees, portalSettings, salaryStructures, users, type AppointmentDetails } from "../shared/db/schema.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { monthlyGross } from "../payroll/calc.js";
import { internshipEnd } from "../payroll/service.js";
import { displayNameFor } from "./onboarding.js";
import { activePolicies, appointmentReference, appointmentText, employeeWithUser, lettersFor, queueAppointmentEmail, snapshotPolicy } from "./appointment.js";

type EmployeeType = "intern" | "full_time" | "contract";

/**
 * The joining terms admins set once in Policies: who signs letters and the
 * standard terms per kind of hire. Every appointment letter starts from
 * these (the issuer can still change them per letter), so the terms in a
 * join letter are set in the portal, not in code.
 */
const typeTermsSchema = z.object({
  workLocation: z.string().trim().min(2).max(300),
  workHours: z.string().trim().min(2).max(300),
  noticeDays: z.number().int().min(0).max(180),
  probationMonths: z.number().int().min(0).max(24).nullable(),
  defaultDurationMonths: z.number().int().min(1).max(60).nullable(),
  additionalTerms: z.string().trim().max(3000).nullable(),
});

export const joiningTermsSchema = z.object({
  signatoryName: z.string().trim().min(2).max(200),
  signatoryTitle: z.string().trim().min(2).max(200),
  department: z.string().trim().min(2).max(200),
  intern: typeTermsSchema,
  full_time: typeTermsSchema,
  contract: typeTermsSchema,
});

export type JoiningTerms = z.infer<typeof joiningTermsSchema>;

const JOINING_TERMS_KEY = "joining_terms";

export const DEFAULT_JOINING_TERMS: JoiningTerms = {
  signatoryName: "Authorised Signatory",
  signatoryTitle: "Director",
  department: "Engineering",
  intern: {
    workLocation: "Remote (India)",
    workHours: "Monday to Friday, 6 hours a day between 10:00 AM and 7:00 PM IST",
    noticeDays: 7,
    probationMonths: null,
    defaultDurationMonths: 6,
    additionalTerms: null,
  },
  full_time: {
    workLocation: "Inveon Technologies office, or remote as agreed",
    workHours: "Monday to Friday, 10:00 AM to 6:00 PM IST",
    noticeDays: 30,
    probationMonths: 6,
    defaultDurationMonths: null,
    additionalTerms: null,
  },
  contract: {
    workLocation: "Inveon Technologies office, or remote as agreed",
    workHours: "Monday to Friday, 10:00 AM to 6:00 PM IST",
    noticeDays: 15,
    probationMonths: null,
    defaultDurationMonths: 6,
    additionalTerms: null,
  },
};

export async function getJoiningTerms(db: Database): Promise<JoiningTerms> {
  const row = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, JOINING_TERMS_KEY) });
  const parsed = joiningTermsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_JOINING_TERMS;
}

export async function saveJoiningTerms(db: Database, terms: JoiningTerms, actorUserId: string) {
  await db
    .insert(portalSettings)
    .values({ key: JOINING_TERMS_KEY, value: terms, updatedBy: actorUserId })
    .onConflictDoUpdate({ target: portalSettings.key, set: { value: terms, updatedBy: actorUserId, updatedAt: new Date() } });
}

export const issueLetterSchema = z.object({
  designation: z.string().trim().min(2).max(200),
  department: z.string().trim().min(2).max(200),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  durationMonths: z.number().int().min(1).max(60).nullable().optional(),
  reportingTo: z.string().trim().max(200).nullable().optional(),
  workLocation: z.string().trim().min(2).max(300),
  workHours: z.string().trim().min(2).max(300),
  monthlyPay: z.number().min(0).max(100_000_000).nullable().optional(),
  probationMonths: z.number().int().min(0).max(24).nullable().optional(),
  noticeDays: z.number().int().min(0).max(180),
  additionalTerms: z.string().trim().max(3000).nullable().optional(),
  signatoryName: z.string().trim().min(2).max(200),
  signatoryTitle: z.string().trim().min(2).max(200),
  policyIds: z.array(z.string().uuid()).max(50).optional(),
  sendEmail: z.boolean().default(true),
});

export type IssueLetterInput = z.infer<typeof issueLetterSchema>;

function endDateFor(joiningDate: string, durationMonths: number | null | undefined) {
  if (!durationMonths) return null;
  return internshipEnd({ joiningDate: new Date(`${joiningDate}T00:00:00Z`), durationMonths })!.toISOString().slice(0, 10);
}

/** Suggested letter terms for an employee: their record and pay, filled out from the joining terms. */
export async function appointmentDefaults(db: Database, employeeId: string) {
  const found = await employeeWithUser(db, employeeId);
  if (!found) throw new NotFoundError("Employee not found");
  const { employee, user } = found;
  const [department, designation, pay, terms] = await Promise.all([
    employee.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, employee.departmentId) }) : null,
    employee.designationId ? db.query.designations.findFirst({ where: eq(designations.id, employee.designationId) }) : null,
    db.query.salaryStructures.findFirst({ where: and(eq(salaryStructures.employeeId, employee.id), lte(salaryStructures.effectiveFrom, new Date(Date.now() + 366 * 86400000))), orderBy: [desc(salaryStructures.effectiveFrom), desc(salaryStructures.createdAt)] }),
    getJoiningTerms(db),
  ]);
  const type = employee.employeeType as EmployeeType;
  const forType = terms[type];
  const intern = type === "intern";
  return {
    signatoryName: terms.signatoryName,
    signatoryTitle: terms.signatoryTitle,
    defaults: {
      name: await displayNameFor(db, employee.userId),
      email: user.email,
      employeeId: employee.businessId,
      employeeType: employee.employeeType,
      designation: designation?.title ?? (intern ? "Software Development Intern" : ""),
      department: department?.name ?? terms.department,
      joiningDate: employee.joiningDate.toISOString().slice(0, 10),
      durationMonths: employee.durationMonths ?? forType.defaultDurationMonths,
      reportingTo: employee.managerId ? await displayNameFor(db, employee.managerId) : null,
      workLocation: forType.workLocation,
      workHours: forType.workHours,
      monthlyPay: pay ? monthlyGross(pay.components) : null,
      probationMonths: intern ? null : forType.probationMonths,
      noticeDays: forType.noticeDays,
      additionalTerms: forType.additionalTerms,
    },
  };
}

/**
 * Issues (and by default emails) an appointment letter: the join letter
 * with the company policies attached as PDFs. Each new letter for the same
 * person is a new version; sent letters never change.
 */
export async function issueAppointmentLetter(db: Database, input: { employeeId: string; body: IssueLetterInput; actorUserId: string; ipAddress?: string }) {
  const { body } = input;
  const found = await employeeWithUser(db, input.employeeId);
  if (!found) throw new NotFoundError("Employee not found");
  const { employee, user } = found;
  if (employee.status === "offboarded") throw new AppError("EMPLOYEE_OFFBOARDED", "This person has left; issue letters only to current staff", 409);

  const chosen = body.policyIds
    ? await db.query.companyPolicies.findMany({ where: and(inArray(companyPolicies.id, body.policyIds.length ? body.policyIds : ["00000000-0000-0000-0000-000000000000"]), eq(companyPolicies.active, true)), orderBy: asc(companyPolicies.orderIndex) })
    : await activePolicies(db);
  const policies = chosen.map(snapshotPolicy);

  const details: AppointmentDetails = {
    name: await displayNameFor(db, employee.userId),
    email: user.email,
    employeeId: employee.businessId ?? "",
    employeeType: employee.employeeType,
    designation: body.designation,
    department: body.department,
    joiningDate: body.joiningDate,
    durationMonths: body.durationMonths ?? null,
    endDate: endDateFor(body.joiningDate, body.durationMonths),
    reportingTo: body.reportingTo || null,
    workLocation: body.workLocation,
    workHours: body.workHours,
    monthlyPay: body.monthlyPay ?? null,
    probationMonths: employee.employeeType === "intern" ? null : body.probationMonths ?? null,
    noticeDays: body.noticeDays,
    additionalTerms: body.additionalTerms || null,
  };

  const previous = await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employee.id), eq(employeeLetters.letterType, "appointment")), columns: { version: true } });
  const version = previous.length ? Math.max(...previous.map((l) => l.version)) + 1 : 1;
  const signatory = { signatoryName: body.signatoryName, signatoryTitle: body.signatoryTitle };

  const letter = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(employeeLetters)
      .values({ employeeId: employee.id, letterType: "appointment", version, content: appointmentText(signatory, details, policies), ...signatory, generatedBy: input.actorUserId, details, policies })
      .returning();
    const [withRef] = await tx.update(employeeLetters).set({ referenceNo: appointmentReference(created.seqNumber, created.generatedAt) }).where(eq(employeeLetters.id, created.id)).returning();
    return withRef;
  });

  if (body.sendEmail) await queueAppointmentEmail(db, letter.id, user.email);
  await notify(db, {
    userIds: [employee.userId],
    actorUserId: input.actorUserId,
    kind: "letter.appointment",
    title: version > 1 ? "Your updated appointment letter is ready" : "Your appointment letter is ready",
    body: `${details.designation}, joining ${details.joiningDate}. Read it and the company policies, then accept it from your workspace.`,
    link: "/employee",
  });
  await writeAuditLog(db, {
    actorUserId: input.actorUserId,
    action: "employee_letter.appointment_issue",
    entityType: "employee_letter",
    entityId: letter.id,
    metadata: { employeeId: employee.id, version, referenceNo: letter.referenceNo, policies: policies.map((p) => `${p.slug}@${p.version}`), emailed: body.sendEmail },
    ipAddress: input.ipAddress,
  });
  return (await lettersFor(db, employee.id)).find((l) => l.id === letter.id)!;
}

/**
 * Issues the join letter for someone just hired, from the joining terms.
 * Letters bind the company, so only admins issue them: when HR hires, the
 * admins are asked to issue it instead (one click on the person's page).
 */
export async function letterOnHire(db: Database, input: { employeeId: string; actor: { sub: string; role: string }; overrides?: Partial<IssueLetterInput>; ipAddress?: string }) {
  const isAdmin = ["admin", "super_admin"].includes(input.actor.role);
  if (!isAdmin) {
    const admins = await db.query.users.findMany({ where: inArray(users.role, ["admin", "super_admin"]), columns: { id: true } });
    const employee = await db.query.employees.findFirst({ where: eq(employees.id, input.employeeId) });
    const who = employee ? await displayNameFor(db, employee.userId) : "A new joiner";
    await notify(db, {
      userIds: admins.map((a) => a.id),
      actorUserId: input.actor.sub,
      kind: "letter.to_issue",
      title: `Issue ${who}'s appointment letter`,
      body: "They've just been hired. The terms are filled in from the joining terms; check them and send.",
      link: `/people/${input.employeeId}`,
      email: true,
    });
    return { issued: false as const, letter: null };
  }
  const { defaults, signatoryName, signatoryTitle } = await appointmentDefaults(db, input.employeeId);
  const body = issueLetterSchema.parse({
    designation: defaults.designation || "Team Member",
    department: defaults.department,
    joiningDate: defaults.joiningDate,
    durationMonths: defaults.durationMonths,
    reportingTo: defaults.reportingTo,
    workLocation: defaults.workLocation,
    workHours: defaults.workHours,
    monthlyPay: defaults.monthlyPay,
    probationMonths: defaults.probationMonths,
    noticeDays: defaults.noticeDays,
    additionalTerms: defaults.additionalTerms,
    signatoryName,
    signatoryTitle,
    sendEmail: true,
    ...input.overrides,
  });
  const letter = await issueAppointmentLetter(db, { employeeId: input.employeeId, body, actorUserId: input.actor.sub, ipAddress: input.ipAddress });
  return { issued: true as const, letter };
}
