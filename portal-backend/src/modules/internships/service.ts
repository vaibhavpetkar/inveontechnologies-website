import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { signatureFor } from "../signature/routes.js";
import type { Database } from "../shared/db/client.js";
import {
  applicationEvents,
  applications,
  courseLessons,
  courseModules,
  courses,
  employees,
  internshipTracks,
  lessonQuizQuestions,
  opportunities,
  participantOffers,
  programEnrollments,
  trackAssignments,
  users,
  type RoadmapPhase,
} from "../shared/db/schema.js";
import { z } from "zod";
import { formatBusinessId } from "../shared/business-id.js";
import { AppError } from "../shared/errors.js";
import { activePolicies, policyFilename, renderPolicyPdf } from "../employees/appointment.js";
import { slugify } from "../shared/slugify.js";
import { logger } from "../shared/logger.js";
import { enqueueJob, registerJobHandler } from "../shared/jobs.js";
import { deliverEmail } from "../shared/mailer.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { notifyHiringTeam } from "../assessments/exams.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import { createEmployeeRecord, displayNameFor, resolveDepartment, resolveDesignation } from "../employees/onboarding.js";
import { longDate, renderLetterPdf, type LetterBlock, type LetterDocument } from "../shared/letter-pdf.js";
import { companyProfile } from "../settings/company.js";
import { feeCategoryFor, feeFor, getOfferTerms, type OfferTerms } from "../settings/offer-terms.js";
import { SKILL_LABELS, SKILLS } from "./catalog-skills.js";
import { TRACKS, trackSkills } from "./catalog-tracks.js";
import { EXERCISES } from "./exercises/bank/index.js";

export type Track = typeof internshipTracks.$inferSelect;
export type TrackAssignment = typeof trackAssignments.$inferSelect;
export type ParticipantOffer = typeof participantOffers.$inferSelect;
type Enrollment = typeof programEnrollments.$inferSelect;

export const EXAM_PASS_PERCENT = 60;
const EXAM_MINUTES = 30;
const EXAM_ATTEMPTS = 3;

const money = (n: number | string) => `Rs. ${Number(n).toLocaleString("en-IN")}`;

// ---------- Roadmap ----------

/**
 * Places every assignment of the track's skills in a month. A skill that
 * appears in two months has its exercises and its projects each split
 * between them in order, so each assignment shows up exactly once.
 */
export function allocateRoadmap(roadmap: RoadmapPhase[], bySkill: Map<string, TrackAssignment[]>) {
  const occurrences = new Map<string, number>();
  for (const phase of roadmap) for (const skill of phase.skills) occurrences.set(skill, (occurrences.get(skill) ?? 0) + 1);
  const used = new Map<string, number>();
  const share = (list: TrackAssignment[], total: number, seen: number) => {
    const per = Math.ceil(list.length / total);
    return list.slice(seen * per, (seen + 1) * per);
  };
  return roadmap.map((phase) => ({
    ...phase,
    skills: phase.skills.map((skill) => {
      const all = bySkill.get(skill) ?? [];
      const total = occurrences.get(skill)!;
      const seen = used.get(skill) ?? 0;
      used.set(skill, seen + 1);
      // Practice exercises first, then the projects that build on them.
      const assignments = [...share(all.filter((a) => a.kind === "exercise"), total, seen), ...share(all.filter((a) => a.kind !== "exercise"), total, seen)];
      return { key: skill, label: SKILL_LABELS[skill] ?? skill, assignments };
    }),
  }));
}

export async function assignmentsForSkills(db: Database, skills: string[]) {
  if (!skills.length) return new Map<string, TrackAssignment[]>();
  const rows = await db.query.trackAssignments.findMany({ where: and(inArray(trackAssignments.skill, skills), eq(trackAssignments.active, true)), orderBy: [asc(trackAssignments.orderIndex)] });
  const map = new Map<string, TrackAssignment[]>();
  for (const r of rows) map.set(r.skill, [...(map.get(r.skill) ?? []), r]);
  return map;
}

// ---------- Catalog install ----------

/**
 * Installs the assignment bank and the six tracks: for each track a
 * published course (a study lesson per skill and a timed final exam) and a
 * published 6-month internship opening with the student and graduate fees. Safe to run
 * again: anything that already exists (by skill+title or track slug) is left
 * as it is, so staff edits survive.
 */
export const EXERCISE_MARKS = 5;

/**
 * Writes the assignment bank. Projects are only added (staff may edit them);
 * auto-checked exercises are kept in step with the code, so fixes to their
 * tests reach existing installs. The reference solutions never leave the code.
 */
export async function syncAssignmentBank(db: Database) {
  await db
    .insert(trackAssignments)
    .values(SKILLS.flatMap((s) => s.assignments.map((a, i) => ({ skill: s.key, title: a.title, brief: a.brief, steps: a.steps, deliverable: a.deliverable ?? "repo", level: a.level ?? "basic", orderIndex: i }))))
    .onConflictDoNothing();
  const exercises = Object.entries(EXERCISES).flatMap(([skill, list]) =>
    list.map((e, i) => ({
      skill,
      title: e.title,
      brief: e.brief,
      steps: e.steps,
      deliverable: "text" as const,
      level: e.level ?? "basic",
      maxMarks: EXERCISE_MARKS,
      orderIndex: i,
      kind: "exercise" as const,
      exercise: { editor: e.editor, starter: e.starter, check: e.check },
    })),
  );
  if (exercises.length) {
    await db
      .insert(trackAssignments)
      .values(exercises)
      .onConflictDoUpdate({
        target: [trackAssignments.skill, trackAssignments.title],
        set: { brief: sql`excluded.brief`, steps: sql`excluded.steps`, level: sql`excluded.level`, orderIndex: sql`excluded.order_index`, kind: sql`excluded.kind`, exercise: sql`excluded.exercise`, maxMarks: sql`excluded.max_marks` },
      });
  }
}

let bankSynced: Promise<void> | null = null;
/** Syncs the bank once per process, the first time the internships pages are used. */
export function ensureBankSynced(db: Database) {
  bankSynced ??= syncAssignmentBank(db).catch((err) => {
    bankSynced = null;
    logger.error({ err }, "syncing the assignment bank failed");
  });
  return bankSynced;
}

const feeSentence = (t: OfferTerms) => `${money(t.studentFee)} for currently pursuing students and ${money(t.graduateFee)} for graduates`;
const feeParen = (t: OfferTerms) => `(${money(t.studentFee)} for students, ${money(t.graduateFee)} for graduates)`;

/**
 * Keeps installed tracks in step with the fee settings: the fee shown on
 * tracks and openings, and the fee wording in their course and opening
 * text (including the Rs. 4,000 wording tracks were first installed with).
 */
export async function syncProgramFees(db: Database, previous: OfferTerms | null = null) {
  try {
    const terms = await getOfferTerms(db);
    const tracks = await db.query.internshipTracks.findMany();
    if (!tracks.length) return;
    const pairs: [string, string][] = [
      ["fee of Rs. 4,000. Paying", `fee of ${feeSentence(terms)}. Paying`],
      ["fee of Rs. 4,000 to start", `fee ${feeParen(terms)} to start`],
    ];
    if (previous) pairs.push([feeSentence(previous), feeSentence(terms)], [feeParen(previous), feeParen(terms)]);
    const replaced = (column: ReturnType<typeof sql.raw>) => pairs.reduce((expr, [from, to]) => sql`replace(${expr}, ${from}, ${to})`, sql`${column}`);
    const oppIds = tracks.map((t) => t.opportunityId).filter((x): x is string => !!x);
    const courseIds = tracks.map((t) => t.courseId).filter((x): x is string => !!x);
    await db.update(internshipTracks).set({ fee: String(terms.studentFee) });
    if (oppIds.length) await db.update(opportunities).set({ programFee: String(terms.studentFee), description: replaced(sql.raw("description")) }).where(inArray(opportunities.id, oppIds));
    if (courseIds.length) {
      const modules = await db.query.courseModules.findMany({ where: inArray(courseModules.courseId, courseIds), columns: { id: true } });
      if (modules.length) await db.update(courseLessons).set({ contentText: replaced(sql.raw("content_text")) }).where(inArray(courseLessons.moduleId, modules.map((m) => m.id)));
    }
  } catch (err) {
    logger.error({ err }, "Could not update the internship fee text");
  }
}

export async function installCatalog(db: Database, adminUserId: string) {
  await syncAssignmentBank(db);
  const terms = await getOfferTerms(db);

  const created: string[] = [];
  for (const [index, seed] of TRACKS.entries()) {
    const existing = await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.slug, seed.slug) });
    if (existing) continue;
    const skills = trackSkills(seed.roadmap).map((k) => SKILLS.find((s) => s.key === k)!).filter(Boolean);

    await db.transaction(async (tx) => {
      const now = new Date();
      const [course] = await tx
        .insert(courses)
        .values({
          title: seed.title,
          description: `${seed.description}\n\nFinish the lessons, then pass the final exam (${EXAM_PASS_PERCENT}% or more) to earn an offer for the 6-month ${seed.title} Internship Program.`,
          status: "published",
          publishedAt: now,
          priceAmount: "0",
          category: "Internship track",
          createdBy: adminUserId,
        })
        .returning();

      const [welcome] = await tx.insert(courseModules).values({ courseId: course.id, title: "Welcome", orderIndex: 0 }).returning();
      await tx.insert(courseLessons).values({
        moduleId: welcome.id,
        title: "How this track works",
        contentType: "document",
        durationMinutes: 10,
        orderIndex: 0,
        contentText: [
          `Welcome to ${seed.title}. This course prepares you for the 6-month ${seed.title} Internship Program at Inveon Technologies.`,
          `You will study ${skills.map((s) => s.label).join(", ")}. Each module gives you the key ideas and the official documentation to learn from. Practise every topic yourself as you go.`,
          `At the end is a ${EXAM_MINUTES}-minute final exam with multiple-choice questions. Score ${EXAM_PASS_PERCENT}% or more and you receive a participant offer letter for the internship by email and in the portal. You have ${EXAM_ATTEMPTS} attempts.`,
          `The internship has a one-time program fee of ${feeSentence(terms)}. Paying it unlocks your 6-month roadmap of assignments, which mentors review and mark, and makes you an official Inveon intern with an employee ID and appointment letter.`,
        ].join("\n\n"),
      });

      for (const [i, skill] of skills.entries()) {
        const [mod] = await tx.insert(courseModules).values({ courseId: course.id, title: skill.label, orderIndex: i + 1 }).returning();
        await tx.insert(courseLessons).values({
          moduleId: mod.id,
          title: `${skill.label}: key concepts`,
          contentType: "document",
          durationMinutes: 45,
          orderIndex: 0,
          contentText: `${skill.lesson}\n\nOfficial documentation: ${skill.docs}`,
        });
      }

      const [finalModule] = await tx.insert(courseModules).values({ courseId: course.id, title: "Final exam", orderIndex: skills.length + 1 }).returning();
      const [exam] = await tx
        .insert(courseLessons)
        .values({
          moduleId: finalModule.id,
          title: `${seed.title} final exam`,
          contentType: "test",
          contentText: `${EXAM_MINUTES} minutes, ${EXAM_PASS_PERCENT}% to pass, ${EXAM_ATTEMPTS} attempts. Passing earns you the internship offer.`,
          durationMinutes: EXAM_MINUTES,
          passingScorePercent: EXAM_PASS_PERCENT,
          timeLimitMinutes: EXAM_MINUTES,
          maxAttempts: EXAM_ATTEMPTS,
          orderIndex: 0,
        })
        .returning();
      const questions = skills.flatMap((s) => s.questions);
      await tx.insert(lessonQuizQuestions).values(
        questions.map((q, i) => ({
          lessonId: exam.id,
          questionText: q.q,
          options: q.options.map((text, j) => ({ id: String.fromCharCode(97 + j), text })),
          correctOptionId: String.fromCharCode(97 + q.answer),
          explanation: q.why,
          orderIndex: i,
        })),
      );

      const [opp] = await tx
        .insert(opportunities)
        .values({
          title: `${seed.title} Internship Program (6 months)`,
          slug: `${slugify(seed.title)}-internship-${Math.random().toString(36).slice(2, 7)}`,
          description: `${seed.description}\n\nHow to join: complete the free ${seed.title} course in the portal and pass its final exam. You'll receive a participant offer; pay the one-time program fee ${feeParen(terms)} to start your 6-month roadmap of reviewed assignments as an Inveon intern.`,
          status: "published",
          publishedAt: now,
          kind: "program",
          durationMonths: 6,
          programFee: String(terms.studentFee),
          trialHours: 0,
          location: "Remote (India)",
          createdBy: adminUserId,
        })
        .returning();
      await tx.update(opportunities).set({ businessId: formatBusinessId("OPP", opp.seqNumber) }).where(eq(opportunities.id, opp.id));

      await tx.insert(internshipTracks).values({ ...seed, fee: String(terms.studentFee), courseId: course.id, examLessonId: exam.id, opportunityId: opp.id, orderIndex: index });
    });
    created.push(seed.title);
  }
  await writeAuditLog(db, { actorUserId: adminUserId, action: "internships.install_catalog", entityType: "internship_track", entityId: null, metadata: { created } });
  return created;
}

// ---------- Offer ----------

export function offerReference(seq: number, issuedAt: Date) {
  return `INV/HR/INT/${issuedAt.getUTCFullYear()}/${String(seq).padStart(4, "0")}`;
}

/** The last day of an internship of `months` starting on `joining` (YYYY-MM-DD). */
export function internshipEndDate(joining: string, months: number) {
  const d = new Date(`${joining}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Passing a track's final exam earns a participant offer: an application to
 * the track's opening (straight to shortlisted), a program enrollment
 * awaiting the fee, and the offer letter by email. Returns null for any
 * other lesson. Runs once per person and track; never throws.
 */
export async function onLessonPassed(db: Database, input: { lessonId: string; userId: string; scorePercent: number }) {
  try {
    const track = await db.query.internshipTracks.findFirst({ where: and(eq(internshipTracks.examLessonId, input.lessonId), eq(internshipTracks.active, true)) });
    if (!track?.opportunityId) return null;
    const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
    if (!user) return null;
    // Staff trying the exam out don't get offers; interns already on a track do.
    if (!["candidate", "intern"].includes(user.role)) return { trackSlug: track.slug, offerId: null, skipped: "staff" as const };

    const existingApp = await db.query.applications.findFirst({ where: and(eq(applications.userId, input.userId), eq(applications.opportunityId, track.opportunityId)) });
    if (existingApp) {
      const enrollment = await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.applicationId, existingApp.id) });
      const offer = enrollment ? await db.query.participantOffers.findFirst({ where: eq(participantOffers.enrollmentId, enrollment.id) }) : null;
      return { trackSlug: track.slug, offerId: offer?.id ?? null };
    }

    const terms = await getOfferTerms(db);
    const feeCategory = await feeCategoryFor(db, input.userId);
    const fee = String(feeFor(terms, feeCategory));
    const joiningDate = nextMonday().toISOString().slice(0, 10);
    const endDate = internshipEndDate(joiningDate, track.durationMonths);

    const { offer, application } = await db.transaction(async (tx) => {
      const [app] = await tx.insert(applications).values({ userId: input.userId, opportunityId: track.opportunityId! }).returning();
      const [withId] = await tx.update(applications).set({ businessId: formatBusinessId("APP", app.seqNumber), status: "shortlisted", updatedAt: new Date() }).where(eq(applications.id, app.id)).returning();
      await tx.insert(applicationEvents).values([
        { applicationId: app.id, fromStatus: null, toStatus: "submitted", actorUserId: input.userId, note: `Passed the ${track.title} final exam with ${input.scorePercent}%` },
        { applicationId: app.id, fromStatus: "submitted", toStatus: "shortlisted", actorUserId: null, note: "Participant offer issued automatically" },
      ]);
      const [enrollment] = await tx
        .insert(programEnrollments)
        .values({ applicationId: app.id, userId: input.userId, opportunityId: track.opportunityId!, status: "awaiting_choice", amount: fee, trialHours: 0 })
        .returning();
      const [created] = await tx
        .insert(participantOffers)
        .values({ enrollmentId: enrollment.id, trackId: track.id, userId: input.userId, examScore: input.scorePercent, fee, feeCategory, workMode: terms.workMode, joiningDate, endDate })
        .returning();
      const [withRef] = await tx.update(participantOffers).set({ referenceNo: offerReference(created.seqNumber, created.issuedAt) }).where(eq(participantOffers.id, created.id)).returning();
      return { offer: withRef, application: withId };
    });

    await enqueueJob(db, "internship.offer_email", { offerId: offer.id });
    await notify(db, {
      userIds: [input.userId],
      kind: "internship.offer",
      title: "You've earned an internship offer!",
      body: `You passed the ${track.title} final exam with ${input.scorePercent}%. Your offer letter for the 6-month internship program is ready.`,
      link: `/internships/${track.slug}`,
    });
    await notifyHiringTeam(db, track.opportunityId, input.userId, {
      kind: "internship.offer",
      title: "Internship offer issued",
      body: (who) => `${who} passed the ${track.title} exam (${input.scorePercent}%) and received a participant offer.`,
      link: `/opportunities/${track.opportunityId}?applicant=${application.id}`,
    });
    return { trackSlug: track.slug, offerId: offer.id };
  } catch (err) {
    logger.error({ err, ...input }, "Could not issue the internship offer");
    return null;
  }
}

const FEE_LABEL = { student: "Currently Pursuing Student", graduate: "Graduate" } as const;
const day = (iso: string) => longDate(new Date(`${iso}T00:00:00Z`));

/** The offer letter, laid out like the company's Internship Offer Letter template. */
export async function offerDocument(db: Database, offer: ParticipantOffer): Promise<LetterDocument> {
  const track = (await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.id, offer.trackId) }))!;
  const user = (await db.query.users.findFirst({ where: eq(users.id, offer.userId) }))!;
  const name = await displayNameFor(db, offer.userId);
  const company = companyProfile();
  const months = track.durationMonths;
  const joining = offer.joiningDate ?? nextMonday(offer.issuedAt).toISOString().slice(0, 10);
  const end = offer.endDate ?? internshipEndDate(joining, months);
  const fee = `${money(offer.fee)}${offer.feeCategory ? ` - ${FEE_LABEL[offer.feeCategory]}` : ""}`;
  const bullets = (...items: string[]): LetterBlock => ({ kind: "bullets", items });
  // Once the offer is accepted (paid or waived), the intern's saved signature goes on it.
  const enrollment = await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, offer.enrollmentId) });
  const accepted = !!enrollment && ["paid", "waived"].includes(enrollment.status);
  const signature = accepted ? await signatureFor(db, offer.userId) : null;

  return {
    title: `Internship Offer - ${name}`,
    kicker: "INTERNSHIP OFFER LETTER",
    heading: { title: "Internship Offer Letter", subtitle: `Ref: ${offer.referenceNo ?? "-"} | Date: ${longDate(offer.issuedAt)}` },
    reference: offer.referenceNo ?? undefined,
    date: offer.issuedAt,
    recipient: [name, user.email],
    subject: `Offer of Internship - ${track.title}`,
    blocks: [
      { kind: "para", text: `Dear ${name},`, bold: true },
      {
        kind: "para",
        text: `We are pleased to offer you an internship with ${company.name} in the ${track.title} track. This offer is subject to the terms set out in this letter and the Company's Internship Program Policy and other applicable Company policies.`,
      },
      {
        kind: "facts",
        rows: [
          ["Internship Track", track.title],
          ["Internship Type", `${months}-Month Internship Program`],
          ["Date Of Joining", day(joining)],
          ["Internship End Date", day(end)],
          ["Work Mode", offer.workMode],
          ["Program Fee", fee],
        ],
      },
      { kind: "heading", text: "1. Internship Terms" },
      bullets(
        `The internship is for ${months === 6 ? "six" : months} months and follows the assigned track roadmap through the Inveon portal.`,
        "The applicable one-time program fee is as stated above. It covers training, mentoring, reviews, portal access and internship certification and is non-refundable once the internship begins, except where the Company cancels the program.",
        "The internship is a training and project-learning program and does not guarantee employment or a stipend unless separately stated in writing.",
      ),
      { kind: "heading", text: "2. Responsibilities and Completion" },
      bullets(
        "You are expected to complete assigned projects and assignments, participate in reviews and mentoring, meet communicated deadlines and maintain professional conduct.",
        "Attendance is recorded through the portal. A minimum of 75% attendance and completion and approval of required project and assignment work are required for successful completion.",
        "On successful completion, you will receive an Internship Completion Certificate.",
      ),
      { kind: "heading", text: "3. Company Policies" },
      bullets(
        `Your internship is subject to the applicable ${company.name} policies, including the Code of Conduct, Leave and Attendance, Information Security and Acceptable Use, Confidentiality and Intellectual Property, POSH, Remote Work and Communication, and Internship Program Policy. You are expected to read and comply with these policies.`,
      ),
      { kind: "heading", text: "4. Confidentiality and Intellectual Property" },
      bullets(
        "You must protect Company and client confidential information during and after the internship. Work created in the course of the internship is subject to the Company's Intellectual Property Policy. Internship projects may be displayed in a personal portfolio only with Company approval and without confidential or client information.",
      ),
      { kind: "heading", text: "5. Termination" },
      bullets(
        "Either you or the Company may end the internship with seven days' written notice. The Company may end the internship immediately for misconduct, plagiarism or serious breach of Company policies. Completion requirements must be met for the Internship Completion Certificate.",
      ),
      { kind: "heading", text: "Acceptance" },
      bullets(
        `Please confirm that you have read and understood this offer and agree to the Internship Program Policy and applicable Company policies by paying the program fee from the ${track.title} page under Internships in the Inveon portal.`,
      ),
      {
        kind: "signatories",
        left: { caption: `For ${company.name.toUpperCase()}`, people: company.signatories, seal: true },
        right: [
          // Left as a line to sign on until a project manager is set in Settings.
          { name: company.projectManager?.name ?? "____________________", title: company.projectManager?.title ?? "Project Manager", subtitle: company.name },
          { caption: "Accepted by:", name, title: "Intern", signature },
        ],
      },
    ],
  };
}

export const offerPdf = async (db: Database, offer: ParticipantOffer) => renderLetterPdf(await offerDocument(db, offer));
export const offerFilename = (track: Pick<Track, "title">) => `Internship-Offer-${track.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;

/** The Internship Program Policy as a PDF, sent with every offer. */
async function programPolicyAttachment(db: Database) {
  const policy = (await activePolicies(db)).find((p) => p.slug === "internship-program");
  return policy ? [{ filename: policyFilename(policy), content: Buffer.from(await renderPolicyPdf(policy, policy.updatedAt)), contentType: "application/pdf" }] : [];
}

export async function queueOfferEmail(db: Database, offerId: string, by?: string, to?: string) {
  await enqueueJob(db, "internship.offer_email", { offerId, by, to });
}

export const offerUpdateSchema = z.object({
  feeCategory: z.enum(["student", "graduate"]),
  fee: z.number().min(0).max(1_000_000),
  workMode: z.enum(["Remote", "Office", "Hybrid"]),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

/**
 * Staff correct an offer before it is paid: student or graduate fee, work
 * mode, dates. The enrollment's amount follows the fee, so the payment page
 * charges the new amount.
 */
export async function updateOffer(db: Database, offer: ParticipantOffer, input: z.infer<typeof offerUpdateSchema>) {
  if (input.endDate <= input.joiningDate) throw new AppError("INVALID_DATES", "The end date must be after the joining date", 400);
  const enrollment = await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, offer.enrollmentId) });
  const feeChanged = Number(offer.fee) !== input.fee;
  if (feeChanged && enrollment && ["paid", "waived", "cancelled"].includes(enrollment.status)) {
    throw new AppError("OFFER_SETTLED", "The fee can't change after it has been paid, waived or cancelled", 400);
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(participantOffers)
      .set({ fee: String(input.fee), feeCategory: input.feeCategory, workMode: input.workMode, joiningDate: input.joiningDate, endDate: input.endDate, updatedAt: new Date() })
      .where(eq(participantOffers.id, offer.id))
      .returning();
    if (feeChanged && enrollment) await tx.update(programEnrollments).set({ amount: String(input.fee), updatedAt: new Date() }).where(eq(programEnrollments.id, enrollment.id));
    return updated;
  });
}

export function registerInternshipJobs(db: Database, appUrl: string) {
  registerJobHandler("internship.offer_email", async (payload) => {
    const offer = await db.query.participantOffers.findFirst({ where: eq(participantOffers.id, String(payload.offerId)) });
    if (!offer) return;
    const track = (await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.id, offer.trackId) }))!;
    const user = (await db.query.users.findFirst({ where: eq(users.id, offer.userId) }))!;
    const first = (await displayNameFor(db, offer.userId)).split(" ")[0];
    await deliverEmail({
      to: payload.to ? String(payload.to) : user.email,
      subject: `Your offer: ${track.title} Internship Program (${track.durationMonths} months)`,
      kind: "internship_offer",
      refId: offer.id,
      triggeredBy: payload.by ? String(payload.by) : undefined,
      text: [
        `Dear ${first},`,
        "",
        `Congratulations! You passed the ${track.title} final exam with ${offer.examScore}%, and we're pleased to offer you a place in the ${track.durationMonths}-month ${track.title} Internship Program. Your offer letter (ref. ${offer.referenceNo}) and the Internship Program Policy are attached.`,
        "",
        offer.joiningDate ? `Your internship starts on ${day(offer.joiningDate)}${offer.endDate ? ` and ends on ${day(offer.endDate)}` : ""} (${offer.workMode}).` : "",
        "",
        `To accept, pay the one-time program fee of ${money(offer.fee)} in the portal. Your roadmap of assignments unlocks right away:`,
        `${appUrl}/internships/${track.slug}`,
        "",
        "Warm regards,",
        "Talent and Training Team",
        "Inveon Technologies",
      ].join("\n"),
      attachments: [{ filename: offerFilename(track), content: Buffer.from(await offerPdf(db, offer)), contentType: "application/pdf" }, ...(await programPolicyAttachment(db))],
    });
    await db.update(participantOffers).set({ emailedAt: new Date() }).where(eq(participantOffers.id, offer.id));
  });
}

// ---------- After payment ----------

/** The Monday on or after `from` (plus a day), as midnight UTC, for joining dates. */
export function nextMonday(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function trackForOpportunity(db: Database, opportunityId: string) {
  return db.query.internshipTracks.findFirst({ where: eq(internshipTracks.opportunityId, opportunityId) });
}

/**
 * The fee was paid (or waived) for a track's program: the roadmap unlocks
 * and the participant is hired as an intern, joining next Monday. Admins
 * are asked to issue the appointment letter. Returns false when the
 * enrollment isn't for a track. Never throws.
 */
export async function onProgramUnlocked(db: Database, enrollment: Enrollment, actorUserId: string | null) {
  try {
    const track = await trackForOpportunity(db, enrollment.opportunityId);
    if (!track) return false;
    const opportunity = (await db.query.opportunities.findFirst({ where: eq(opportunities.id, enrollment.opportunityId) }))!;

    await notify(db, {
      userIds: [enrollment.userId],
      kind: "internship.unlocked",
      actorUserId: actorUserId ?? undefined,
      title: "Your internship roadmap is unlocked",
      body: `Welcome to the ${track.title} Internship Program! Start with Month 1 on your roadmap.`,
      link: `/internships/${track.slug}`,
      email: true,
    });

    const already = await db.query.employees.findFirst({ where: eq(employees.userId, enrollment.userId) });
    if (!already) {
      const employee = await createEmployeeRecord(db, {
        userId: enrollment.userId,
        applicationId: enrollment.applicationId,
        employeeType: "intern",
        departmentId: await resolveDepartment(db, "Engineering"),
        designationId: await resolveDesignation(db, `${track.title} Intern`),
        managerId: opportunity.hiringManagerId,
        joiningDate: nextMonday(),
        durationMonths: track.durationMonths,
        createdBy: actorUserId ?? opportunity.createdBy,
      });
      const application = await db.query.applications.findFirst({ where: eq(applications.id, enrollment.applicationId) });
      if (application?.status === "shortlisted") {
        await applyApplicationTransition(db, { applicationId: application.id, from: "shortlisted", to: "selected", actorUserId, note: `Joined as intern ${employee.businessId}` });
      }
      const admins = await db.query.users.findMany({ where: inArray(users.role, ["admin", "super_admin"]), columns: { id: true } });
      const who = await displayNameFor(db, enrollment.userId);
      await notify(db, {
        userIds: admins.map((a) => a.id),
        kind: "internship.hired",
        title: `Issue ${who}'s appointment letter`,
        body: `${who} paid for the ${track.title} Internship Program and joined as intern ${employee.businessId}. Issue their appointment letter from the People page.`,
        link: `/people/${employee.id}`,
        email: true,
      });
    }
    return true;
  } catch (err) {
    logger.error({ err, enrollmentId: enrollment.id }, "Could not finish joining the internship");
    return true;
  }
}

/** Counts per track for the catalog. */
export async function trackStats(db: Database) {
  const rows = await db.execute<{ trackId: string; interns: number }>(sql`
    SELECT t.id AS "trackId", count(pe.id) FILTER (WHERE pe.status IN ('paid', 'waived'))::int AS interns
    FROM internship_tracks t LEFT JOIN program_enrollments pe ON pe.opportunity_id = t.opportunity_id
    GROUP BY t.id
  `);
  return new Map(rows.rows.map((r) => [r.trackId, r.interns]));
}
