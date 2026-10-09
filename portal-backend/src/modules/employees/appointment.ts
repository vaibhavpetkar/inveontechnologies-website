import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { companyPolicies, employeeLetters, employeeOnboardingTasks, employees, users, type AppointmentDetails, type PolicySnapshot } from "../shared/db/schema.js";
import { blocksToText, longDate, parseRichText, renderLetterPdf, type LetterBlock } from "../shared/letter-pdf.js";
import { amountInWords } from "../payroll/pdf.js";
import { deliverEmail } from "../shared/mailer.js";
import { enqueueJob, registerJobHandler } from "../shared/jobs.js";
import { logger } from "../shared/logger.js";
import { companyProfile } from "../settings/company.js";
import { DEFAULT_POLICIES, POLICIES_EFFECTIVE } from "./policy-defaults.js";
import { PREVIOUS_DEFAULT_POLICIES } from "./policy-previous.js";
import { notifyIfOnboardingComplete } from "./onboarding.js";

export type EmployeeLetter = typeof employeeLetters.$inferSelect;
export type CompanyPolicy = typeof companyPolicies.$inferSelect;

const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const date = (iso: string) => longDate(new Date(`${iso}T00:00:00Z`));

let policiesSeeded = false;

const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/**
 * Inserts the default policies that don't exist yet, and moves any policy
 * still carrying an earlier default wording (never edited by an admin) to
 * the current wording as a new version. Edited policies are never touched.
 * Runs at startup and again on first use, in case the server started before
 * the migration that adds the table.
 */
export async function ensureDefaultPolicies(db: Database) {
  if (policiesSeeded) return;
  try {
    await db
      .insert(companyPolicies)
      .values(DEFAULT_POLICIES.map((p, i) => ({ ...p, orderIndex: i })))
      .onConflictDoNothing({ target: companyPolicies.slug });
    const existing = await db.query.companyPolicies.findMany({ where: inArray(companyPolicies.slug, DEFAULT_POLICIES.map((p) => p.slug)) });
    for (const row of existing) {
      const current = DEFAULT_POLICIES.find((p) => p.slug === row.slug)!;
      const previous = PREVIOUS_DEFAULT_POLICIES.find((p) => p.slug === row.slug);
      if (!previous || sameText(row.body, current.body) || !sameText(row.body, previous.body)) continue;
      await db
        .update(companyPolicies)
        .set({ body: current.body, summary: current.summary, title: current.title, version: row.version + 1, updatedAt: new Date() })
        .where(and(eq(companyPolicies.id, row.id), eq(companyPolicies.version, row.version)));
      logger.info({ slug: row.slug, version: row.version + 1 }, "Updated an unedited company policy to the current wording");
    }
    policiesSeeded = true;
  } catch (err) {
    logger.error({ err }, "Could not seed the default company policies");
  }
}

export async function activePolicies(db: Database) {
  await ensureDefaultPolicies(db);
  return db.query.companyPolicies.findMany({ where: eq(companyPolicies.active, true), orderBy: [asc(companyPolicies.orderIndex), asc(companyPolicies.title)] });
}

export const snapshotPolicy = (p: CompanyPolicy): PolicySnapshot => ({ id: p.id, slug: p.slug, title: p.title, version: p.version, body: p.body });

/** A policy on its own letterhead, the same file whether downloaded or attached to a letter. */
export function renderPolicyPdf(policy: Pick<PolicySnapshot, "title" | "version" | "body" | "slug">, effective?: Date) {
  // Never earlier than the date the current policy set took effect.
  const from = new Date(`${POLICIES_EFFECTIVE}T00:00:00+05:30`);
  const when = effective && effective > from ? effective : from;
  return renderLetterPdf({
    title: policy.title,
    kicker: "COMPANY POLICY",
    heading: { title: policy.title, subtitle: `Company Policy · Effective ${longDate(when)}${policy.version > 1 ? ` · Version ${policy.version}` : ""}` },
    reference: `INV/POL/${policy.slug.toUpperCase()}${policy.version > 1 ? `/V${policy.version}` : ""}`,
    blocks: parseRichText(policy.body),
  });
}

export const policyFilename = (p: Pick<PolicySnapshot, "title" | "version">) => `${p.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-v${p.version}.pdf`;

/** "React Developer" becomes "React Developer (Intern)" for interns; "React Intern" stays as is. */
export const roleTitle = (d: Pick<AppointmentDetails, "designation" | "employeeType">) =>
  d.employeeType === "intern" && !/\bintern(ship)?\b/i.test(d.designation) ? `${d.designation} (Intern)` : d.designation;

export function appointmentReference(seq: number, issuedAt: Date) {
  return `INV/HR/APT/${issuedAt.getUTCFullYear()}/${String(seq).padStart(4, "0")}`;
}

/** The letter itself as layout blocks: terms table, numbered clauses, policies, signatures. */
export function appointmentBlocks(d: AppointmentDetails, letter: { signatoryName: string; signatoryTitle: string; policies: PolicySnapshot[]; acceptedAt?: Date | null; acceptedName?: string | null }): LetterBlock[] {
  const intern = d.employeeType === "intern";
  const first = d.name.split(" ")[0] || d.name;
  const role = roleTitle(d);
  const term = d.durationMonths ? `${d.durationMonths} month${d.durationMonths === 1 ? "" : "s"}${d.endDate ? `, until ${date(d.endDate)}` : ""}` : "Permanent, subject to probation";
  const pay = d.monthlyPay && d.monthlyPay > 0 ? `${money(d.monthlyPay)} per month` : intern ? "Training internship, no stipend" : "As per salary structure";

  const facts: [string, string][] = [
    ["Name", d.name],
    ["Employee ID", d.employeeId],
    ["Designation", role],
    ["Department", d.department],
    ["Employment type", intern ? "Internship" : d.employeeType === "contract" ? "Contract" : "Full-time"],
    ["Date of joining", date(d.joiningDate)],
    [intern || d.employeeType === "contract" ? "Duration" : "Tenure", term],
    ["Reporting to", d.reportingTo ?? "To be assigned"],
    ["Work location", d.workLocation],
    ["Working hours", d.workHours],
    [intern ? "Stipend" : "Gross salary", pay],
  ];
  if (!intern && d.probationMonths) facts.push(["Probation", `${d.probationMonths} months`]);
  facts.push(["Notice period", `${d.noticeDays} days`]);

  const clauses: { title: string; text: string }[] = [
    {
      title: intern ? "Internship term" : "Appointment",
      text: intern
        ? `Your internship begins on ${date(d.joiningDate)} and runs for ${term}. It may be extended in writing by mutual agreement, or ended earlier as set out in the notice clause below.`
        : `Your appointment begins on ${date(d.joiningDate)}.${d.employeeType === "contract" && d.durationMonths ? ` It is a fixed-term contract for ${term}.` : ""}${d.probationMonths ? ` You will be on probation for ${d.probationMonths} months, after which your confirmation will be communicated in writing based on your performance.` : ""}`,
    },
    {
      title: "Role and responsibilities",
      text: `You will work as ${role} in the ${d.department} team${d.reportingTo ? `, reporting to ${d.reportingTo}` : ""}. ${intern ? "You will complete the assignments and projects on your internship roadmap, attend scheduled sessions and reviews, and keep your tasks up to date in the Inveon portal." : "You will perform the duties of this role and any related work reasonably assigned to you, and keep your tasks up to date in the Inveon portal."}`,
    },
    {
      title: intern ? "Stipend" : "Compensation",
      text:
        d.monthlyPay && d.monthlyPay > 0
          ? intern
            ? `You will receive a monthly stipend of ${money(d.monthlyPay)} (${amountInWords(d.monthlyPay)}), paid for days worked and credited by the 7th of the following month.`
            : `Your gross salary will be ${money(d.monthlyPay)} per month (${amountInWords(d.monthlyPay)}), an annual cost to company of ${money(d.monthlyPay * 12)}. The breakdown and statutory deductions are shown on your payslips in the portal.`
          : intern
            ? "This is a training internship without stipend. A performance-based stipend may be offered at the Company's discretion, in writing."
            : "Your compensation is set out in your salary structure in the portal and on your payslips.",
    },
    {
      title: "Working hours, attendance and leave",
      text: `Your working hours are ${d.workHours}, at ${d.workLocation}. Mark your attendance and apply for leave in the portal, as described in the Leave and Attendance Policy.`,
    },
    {
      title: "Confidentiality and intellectual property",
      text: "You will keep the Company's and its clients' information confidential during and after your engagement. All work you create in the course of your engagement belongs to the Company, as set out in the Confidentiality and Intellectual Property Policy.",
    },
    {
      title: "Company policies",
      text: letter.policies.length
        ? `You agree to follow the Company's policies, which are attached to this letter: ${letter.policies.map((p) => p.title).join(", ")}. Policies may be updated from time to time; the current versions are always available in the portal.`
        : "You agree to follow the Company's policies, available in the portal. Policies may be updated from time to time.",
    },
    {
      title: "Notice and termination",
      text: `Either party may end this ${intern ? "internship" : "employment"} by giving ${d.noticeDays} days' written notice. The Company may end it without notice in case of misconduct, breach of confidentiality, falsified information, or a serious breach of its policies.`,
    },
  ];
  if (intern) {
    clauses.push({
      title: "Completion certificate",
      text: "On successful completion of the internship, with your required assignments approved and your attendance in order, you will receive an Internship Completion Certificate that can be verified online.",
    });
  }
  if (d.additionalTerms?.trim()) clauses.push({ title: "Additional terms", text: d.additionalTerms.trim() });

  const accepted = letter.acceptedAt ? `Accepted electronically on ${longDate(letter.acceptedAt)}${letter.acceptedName ? ` as "${letter.acceptedName}"` : ""}.` : undefined;

  return [
    { kind: "para", text: `Dear ${first},` },
    {
      kind: "para",
      text: intern
        ? `We are pleased to appoint you as ${role} at Inveon Technologies. Welcome to the team! This letter sets out the terms of your internship.`
        : `We are pleased to appoint you as ${role} at Inveon Technologies. Welcome to the team! This letter sets out the terms of your appointment.`,
    },
    { kind: "facts", rows: facts },
    { kind: "heading", text: "Terms of appointment" },
    { kind: "clauses", items: clauses },
    {
      kind: "callout",
      title: "Acceptance",
      text: "Please read this letter and the attached policies, then accept it in the Inveon portal from your Workspace page within 7 days. Accepting confirms that you agree to these terms and to the Company's policies.",
    },
    { kind: "para", text: "We look forward to working with you." },
    {
      kind: "signatories",
      left: { caption: `For ${companyProfile().name.toUpperCase()}`, people: [{ name: letter.signatoryName, title: letter.signatoryTitle }], seal: true },
      right: [{ caption: "Accepted by:", name: d.name, title: role, note: accepted }],
    },
  ];
}

export function appointmentDocument(letter: EmployeeLetter) {
  const d = letter.details!;
  const policies = letter.policies ?? [];
  return {
    title: `Appointment Letter - ${d.name}`,
    kicker: "APPOINTMENT LETTER",
    reference: letter.referenceNo ?? undefined,
    date: letter.generatedAt,
    recipient: [d.name, d.email],
    subject: `Appointment as ${roleTitle(d)}`,
    blocks: appointmentBlocks(d, { signatoryName: letter.signatoryName, signatoryTitle: letter.signatoryTitle, policies, acceptedAt: letter.acceptedAt, acceptedName: letter.acceptedName }),
  };
}

export const appointmentText = (letter: Pick<EmployeeLetter, "signatoryName" | "signatoryTitle">, d: AppointmentDetails, policies: PolicySnapshot[]) =>
  blocksToText(appointmentBlocks(d, { ...letter, policies }));

export const appointmentPdf = (letter: EmployeeLetter) => renderLetterPdf(appointmentDocument(letter));
export const appointmentFilename = (letter: EmployeeLetter) => `Appointment-Letter-${(letter.details?.name ?? "Employee").replace(/[^A-Za-z0-9]+/g, "-")}${letter.version > 1 ? `-v${letter.version}` : ""}.pdf`;

/** Registers the job that emails an appointment letter with its policies attached. */
export function registerLetterJobs(db: Database, appUrl: string) {
  registerJobHandler("letter.email", async (payload) => {
    const letter = await db.query.employeeLetters.findFirst({ where: eq(employeeLetters.id, String(payload.letterId)) });
    if (!letter?.details) return; // deleted, or not an appointment letter: nothing to send
    const d = letter.details;
    const policies = letter.policies ?? [];
    const attachments = [
      { filename: appointmentFilename(letter), content: Buffer.from(await appointmentPdf(letter)), contentType: "application/pdf" },
      ...(await Promise.all(policies.map(async (p) => ({ filename: policyFilename(p), content: Buffer.from(await renderPolicyPdf(p, letter.generatedAt)), contentType: "application/pdf" })))),
    ];
    const first = d.name.split(" ")[0] || d.name;
    const role = roleTitle(d);
    const text = [
      `Dear ${first},`,
      "",
      `Congratulations! Please find attached your appointment letter as ${role} at Inveon Technologies (ref. ${letter.referenceNo}).`,
      "",
      `Your joining date is ${date(d.joiningDate)}.`,
      "",
      policies.length ? "The company policies that apply to you are attached as well:" : "",
      ...policies.map((p) => `- ${p.title}`),
      policies.length ? "" : "",
      "Please read them and accept your letter in the portal within 7 days:",
      `${appUrl}/employee`,
      "",
      "If anything in the letter needs correcting, reply to this email before accepting.",
      "",
      "Warm regards,",
      letter.signatoryName,
      letter.signatoryTitle,
      "Inveon Technologies",
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n");
    const to = String(payload.to ?? d.email);
    await deliverEmail({ to, subject: `Your appointment letter: ${role}, Inveon Technologies`, text, attachments, kind: "appointment_letter", refId: letter.id, triggeredBy: payload.by ? String(payload.by) : undefined });
    await db.update(employeeLetters).set({ emailedTo: to, emailedAt: new Date() }).where(eq(employeeLetters.id, letter.id));
  });
}

export async function queueAppointmentEmail(db: Database, letterId: string, to: string, by?: string) {
  await enqueueJob(db, "letter.email", { letterId, to, by });
}

/**
 * Accepting the letter stands in for the policy consent and the signed
 * letter upload on the onboarding checklist, so those items are ticked.
 */
export async function completeLetterChecklistItems(db: Database, employeeId: string) {
  const now = new Date();
  await db
    .update(employeeOnboardingTasks)
    .set({ status: "completed", completedAt: now })
    .where(
      and(
        eq(employeeOnboardingTasks.employeeId, employeeId),
        eq(employeeOnboardingTasks.status, "pending"),
        or(eq(employeeOnboardingTasks.taskType, "policy_consent"), and(eq(employeeOnboardingTasks.taskType, "document"), ilike(employeeOnboardingTasks.title, "%appointment letter%"))),
      ),
    );
  await notifyIfOnboardingComplete(db, employeeId);
}

/** Letters list for a person, newest first, without the heavy snapshot fields. */
export async function lettersFor(db: Database, employeeId: string) {
  const rows = await db.query.employeeLetters.findMany({ where: and(eq(employeeLetters.employeeId, employeeId), eq(employeeLetters.letterType, "appointment")) });
  const issuers = rows.length ? await db.query.users.findMany({ where: inArray(users.id, [...new Set(rows.map((r) => r.generatedBy))]), columns: { id: true, email: true, fullName: true } }) : [];
  const byId = new Map(issuers.map((u) => [u.id, u.fullName ?? u.email]));
  return rows
    .filter((r) => r.details)
    .sort((a, b) => b.version - a.version)
    .map((r) => ({
      id: r.id,
      version: r.version,
      referenceNo: r.referenceNo,
      details: r.details,
      policies: (r.policies ?? []).map(({ body, ...p }) => p),
      signatoryName: r.signatoryName,
      signatoryTitle: r.signatoryTitle,
      issuedBy: byId.get(r.generatedBy) ?? null,
      generatedAt: r.generatedAt,
      emailedTo: r.emailedTo,
      emailedAt: r.emailedAt,
      acceptedAt: r.acceptedAt,
      acceptedName: r.acceptedName,
    }));
}

export async function employeeWithUser(db: Database, employeeId: string) {
  const employee = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!employee) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, employee.userId) });
  return user ? { employee, user } : null;
}
