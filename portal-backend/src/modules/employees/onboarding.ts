import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, departments, designations, employeeOnboardingTasks, employees, offers, users, verificationTokens } from "../shared/db/schema.js";
import { generateOneTimeToken } from "../auth/tokens.js";
import { formatBusinessId } from "../shared/business-id.js";
import { enqueueJob } from "../shared/jobs.js";
import { writeAuditLog } from "../shared/audit.js";
import { formatWhen } from "../shared/format.js";
import { enrollInOpportunityCourses } from "../courses/programs.js";
import { notify } from "../notifications/service.js";
import { logger } from "../shared/logger.js";

export type EmployeeType = "intern" | "full_time" | "contract";
type TaskType = "policy_consent" | "access_activation" | "document" | "custom";

/** Every new joiner gets this checklist; HR can add more per person. */
export function defaultChecklist(type: EmployeeType): { taskType: TaskType; title: string; description?: string; required: boolean }[] {
  return [
    { taskType: "policy_consent", title: "Read and accept the company policies", description: "Code of conduct, IT and data security, and leave policy.", required: true },
    { taskType: "document", title: "Upload a government ID", description: "Aadhaar or PAN, for your employee file.", required: true },
    { taskType: "document", title: "Upload your signed offer or appointment letter", required: true },
    { taskType: "custom", title: "Add an emergency contact", required: true },
    ...(type === "intern" ? [{ taskType: "custom" as const, title: "Join the kickoff call with your mentor", required: false }] : []),
    // Not required: it's HR's own final step, completed by activate-access.
    { taskType: "access_activation", title: "HR activates your portal access", required: false },
  ];
}

export interface NewEmployeeInput {
  userId: string;
  applicationId?: string | null;
  employeeType: EmployeeType;
  departmentId?: string | null;
  designationId?: string | null;
  managerId?: string | null;
  hrManagerId?: string | null;
  joiningDate: Date;
  durationMonths?: number | null;
  createdBy: string;
  /** Portal role to give the person; defaults from employeeType. */
  role?: "intern" | "employee" | "manager";
}

/**
 * The one place an employee record is created (from an application, from an
 * accepted offer, or from an invite): inserts the record with its business
 * id, gives the account its staff role, seeds the onboarding checklist and
 * tells the people involved.
 */
export async function createEmployeeRecord(db: Database, input: NewEmployeeInput) {
  const role = input.role ?? (input.employeeType === "intern" ? "intern" : "employee");

  const employee = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(employees)
      .values({
        userId: input.userId,
        applicationId: input.applicationId ?? null,
        employeeType: input.employeeType,
        departmentId: input.departmentId ?? null,
        designationId: input.designationId ?? null,
        managerId: input.managerId ?? null,
        hrManagerId: input.hrManagerId ?? null,
        joiningDate: input.joiningDate,
        durationMonths: input.durationMonths ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    const [updated] = await tx.update(employees).set({ businessId: formatBusinessId("INV-EMP", created.seqNumber) }).where(eq(employees.id, created.id)).returning();
    // The portal-access transition: the account's role changes (applied on
    // the person's next token refresh), not just a row in a new table.
    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, input.userId));
    await tx.insert(employeeOnboardingTasks).values(defaultChecklist(input.employeeType).map((t) => ({ ...t, employeeId: created.id })));
    return updated;
  });

  await writeAuditLog(db, {
    actorUserId: input.createdBy,
    action: "employee.create",
    entityType: "employee",
    entityId: employee.id,
    metadata: { applicationId: input.applicationId ?? null, businessId: employee.businessId },
  });

  await notify(db, {
    userIds: [input.userId],
    kind: "onboarding.started",
    title: "Welcome to Inveon!",
    body: `Your employee record ${employee.businessId} is set up. Work through your onboarding checklist before ${formatWhen(input.joiningDate)}.`,
    link: "/employee",
  });
  if (input.managerId) {
    const person = await displayNameFor(db, input.userId);
    await notify(db, { userIds: [input.managerId], actorUserId: input.createdBy, kind: "team.joined", title: `${person} is joining your team`, body: `Starting ${formatWhen(input.joiningDate)}.`, link: "/people" });
  }
  return employee;
}

export async function displayNameFor(db: Database, userId: string) {
  const row = await db.execute<{ name: string }>(sql`
    SELECT coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
    FROM users u LEFT JOIN candidate_profiles cp ON cp.user_id = u.id WHERE u.id = ${userId}
  `);
  return row.rows[0]?.name ?? "A new teammate";
}

/** Finds a department by name (case-insensitive) or creates it. */
export async function resolveDepartment(db: Database, name?: string | null) {
  const clean = name?.trim();
  if (!clean) return null;
  const found = await db.query.departments.findFirst({ where: sql`lower(${departments.name}) = ${clean.toLowerCase()}` });
  if (found) return found.id;
  const [created] = await db.insert(departments).values({ name: clean }).onConflictDoNothing().returning();
  return created?.id ?? (await db.query.departments.findFirst({ where: eq(departments.name, clean) }))!.id;
}

export async function resolveDesignation(db: Database, title?: string | null) {
  const clean = title?.trim();
  if (!clean) return null;
  const found = await db.query.designations.findFirst({ where: sql`lower(${designations.title}) = ${clean.toLowerCase()}` });
  if (found) return found.id;
  const [created] = await db.insert(designations).values({ title: clean }).onConflictDoNothing().returning();
  return created?.id ?? (await db.query.designations.findFirst({ where: eq(designations.title, clean) }))!.id;
}

/**
 * Welcome email for an invited person. A brand-new account gets a link to
 * choose a password (reusing the reset-password page, valid 7 days).
 */
export async function queueWelcomeEmail(db: Database, appUrl: string, user: { id: string; email: string }, options: { newAccount: boolean; joiningDate: Date }) {
  let access = `Sign in at ${appUrl}/login with your existing password.`;
  if (options.newAccount) {
    const { plaintext, hash } = generateOneTimeToken();
    await db.insert(verificationTokens).values({ userId: user.id, tokenHash: hash, purpose: "password_reset", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    access = `Choose your password here (the link works for 7 days):\n\n${appUrl}/reset-password?token=${plaintext}`;
  }
  await enqueueJob(db, "email.send", {
    to: user.email,
    subject: "Welcome to Inveon — set up your portal account",
    text: `Welcome aboard! Your start date is ${formatWhen(options.joiningDate)}.\n\n${access}\n\nOnce you're in, your onboarding checklist is on your workspace page.`,
  });
}

/**
 * Runs when a candidate accepts an offer. If the offer carries structured
 * terms (type + joining date), the employee record is created on the spot;
 * otherwise HR is asked to finish onboarding. Never throws into the accept
 * request — the acceptance itself has already been saved.
 */
export async function onboardFromAcceptedOffer(db: Database, offer: typeof offers.$inferSelect, applicantUserId: string) {
  try {
    // The training track that comes with the role starts with the offer.
    await enrollInOpportunityCourses(db, offer.applicationId, "offer_accepted");
    const application = await db.query.applications.findFirst({ where: eq(applications.id, offer.applicationId) });
    const hr = [offer.generatedBy, offer.approvedBy];
    const existing = await db.query.employees.findFirst({ where: eq(employees.applicationId, offer.applicationId) });
    if (!application || application.status !== "selected" || existing) {
      await notify(db, { userIds: hr, actorUserId: applicantUserId, kind: "offer.accepted", title: "Offer accepted", body: "A candidate accepted their offer.", link: "/people", email: true });
      return null;
    }

    if (!offer.employeeType || !offer.joiningDate) {
      await notify(db, { userIds: hr, kind: "onboarding.needs_hr", actorUserId: applicantUserId, title: "Offer accepted: finish onboarding", body: "The offer had no start date or employment type, so the employee record wasn't created automatically. Create it from the People page.", link: "/people", email: true });
      return null;
    }

    const opportunity = await db.query.opportunities.findFirst({ where: (o, { eq: e }) => e(o.id, application.opportunityId), columns: { hiringManagerId: true } });
    const employee = await createEmployeeRecord(db, {
      userId: applicantUserId,
      applicationId: application.id,
      employeeType: offer.employeeType,
      joiningDate: offer.joiningDate,
      durationMonths: offer.durationMonths,
      managerId: opportunity?.hiringManagerId ?? null,
      hrManagerId: offer.generatedBy,
      createdBy: offer.approvedBy ?? offer.generatedBy,
    });
    await notify(db, { userIds: hr, kind: "onboarding.started", title: "Offer accepted: onboarding started", body: `Employee record ${employee.businessId} was created from the accepted offer.`, link: "/people" });
    return employee;
  } catch (err) {
    logger.error({ err, offerId: offer.id }, "Automatic onboarding after offer acceptance failed");
    return null;
  }
}

/** Tells HR when a joiner has finished every required step. */
export async function notifyIfOnboardingComplete(db: Database, employeeId: string) {
  const tasks = await db.query.employeeOnboardingTasks.findMany({ where: and(eq(employeeOnboardingTasks.employeeId, employeeId), eq(employeeOnboardingTasks.required, true)) });
  if (tasks.length === 0 || tasks.some((t) => t.status !== "completed")) return;
  const employee = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!employee || employee.portalAccessActive) return;
  const name = await displayNameFor(db, employee.userId);
  await notify(db, {
    userIds: [employee.hrManagerId ?? employee.createdBy],
    kind: "onboarding.ready",
    title: `${name} finished onboarding`,
    body: "All required checklist items are done. Activate their portal access from the People page.",
    link: "/people",
    dedupeKey: `onboarding-ready:${employee.id}`,
    email: true,
  });
}
