import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
import { formatBusinessId } from "../shared/business-id.js";
import { slugify } from "../shared/slugify.js";
import { logger } from "../shared/logger.js";
import { enqueueJob, registerJobHandler } from "../shared/jobs.js";
import { deliverEmail } from "../shared/mailer.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { notifyHiringTeam } from "../assessments/exams.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import { createEmployeeRecord, displayNameFor, resolveDepartment, resolveDesignation } from "../employees/onboarding.js";
import { letterheadAddress } from "../employees/appointment.js";
import { longDate, renderLetterPdf, type LetterDocument } from "../shared/letter-pdf.js";
import { SKILL_LABELS, SKILLS } from "./catalog-skills.js";
import { TRACKS, trackSkills } from "./catalog-tracks.js";

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
 * appears in two months has its assignments split between them in order,
 * so each assignment shows up exactly once.
 */
export function allocateRoadmap(roadmap: RoadmapPhase[], bySkill: Map<string, TrackAssignment[]>) {
  const occurrences = new Map<string, number>();
  for (const phase of roadmap) for (const skill of phase.skills) occurrences.set(skill, (occurrences.get(skill) ?? 0) + 1);
  const used = new Map<string, number>();
  return roadmap.map((phase) => ({
    ...phase,
    skills: phase.skills.map((skill) => {
      const all = bySkill.get(skill) ?? [];
      const total = occurrences.get(skill)!;
      const seen = used.get(skill) ?? 0;
      used.set(skill, seen + 1);
      const per = Math.ceil(all.length / total);
      return { key: skill, label: SKILL_LABELS[skill] ?? skill, assignments: all.slice(seen * per, (seen + 1) * per) };
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
 * published 6-month internship opening with the Rs. 4,000 fee. Safe to run
 * again: anything that already exists (by skill+title or track slug) is left
 * as it is, so staff edits survive.
 */
export async function installCatalog(db: Database, adminUserId: string) {
  await db
    .insert(trackAssignments)
    .values(SKILLS.flatMap((s) => s.assignments.map((a, i) => ({ skill: s.key, title: a.title, brief: a.brief, steps: a.steps, deliverable: a.deliverable ?? "repo", level: a.level ?? "basic", orderIndex: i }))))
    .onConflictDoNothing();

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
          "The internship has a one-time program fee of Rs. 4,000. Paying it unlocks your 6-month roadmap of assignments, which mentors review and mark, and makes you an official Inveon intern with an employee ID and appointment letter.",
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
          description: `${seed.description}\n\nHow to join: complete the free ${seed.title} course in the portal and pass its final exam. You'll receive a participant offer; pay the one-time program fee of Rs. 4,000 to start your 6-month roadmap of reviewed assignments as an Inveon intern.`,
          status: "published",
          publishedAt: now,
          kind: "program",
          durationMonths: 6,
          programFee: "4000",
          trialHours: 0,
          location: "Remote (India)",
          createdBy: adminUserId,
        })
        .returning();
      await tx.update(opportunities).set({ businessId: formatBusinessId("OPP", opp.seqNumber) }).where(eq(opportunities.id, opp.id));

      await tx.insert(internshipTracks).values({ ...seed, courseId: course.id, examLessonId: exam.id, opportunityId: opp.id, orderIndex: index });
    });
    created.push(seed.title);
  }
  await writeAuditLog(db, { actorUserId: adminUserId, action: "internships.install_catalog", entityType: "internship_track", entityId: null, metadata: { created } });
  return created;
}

// ---------- Offer ----------

export function offerReference(seq: number, issuedAt: Date) {
  return `INV/INT/${issuedAt.getUTCFullYear()}/${String(seq).padStart(4, "0")}`;
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

    const { offer, application } = await db.transaction(async (tx) => {
      const [app] = await tx.insert(applications).values({ userId: input.userId, opportunityId: track.opportunityId! }).returning();
      const [withId] = await tx.update(applications).set({ businessId: formatBusinessId("APP", app.seqNumber), status: "shortlisted", updatedAt: new Date() }).where(eq(applications.id, app.id)).returning();
      await tx.insert(applicationEvents).values([
        { applicationId: app.id, fromStatus: null, toStatus: "submitted", actorUserId: input.userId, note: `Passed the ${track.title} final exam with ${input.scorePercent}%` },
        { applicationId: app.id, fromStatus: "submitted", toStatus: "shortlisted", actorUserId: null, note: "Participant offer issued automatically" },
      ]);
      const [enrollment] = await tx
        .insert(programEnrollments)
        .values({ applicationId: app.id, userId: input.userId, opportunityId: track.opportunityId!, status: "awaiting_choice", amount: track.fee, trialHours: 0 })
        .returning();
      const [created] = await tx.insert(participantOffers).values({ enrollmentId: enrollment.id, trackId: track.id, userId: input.userId, examScore: input.scorePercent, fee: track.fee }).returning();
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

export async function offerDocument(db: Database, offer: ParticipantOffer): Promise<LetterDocument> {
  const track = (await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.id, offer.trackId) }))!;
  const user = (await db.query.users.findFirst({ where: eq(users.id, offer.userId) }))!;
  const name = await displayNameFor(db, offer.userId);
  const bySkill = await assignmentsForSkills(db, trackSkills(track.roadmap));
  const phases = allocateRoadmap(track.roadmap, bySkill);
  const assignmentCount = phases.reduce((n, p) => n + p.skills.reduce((m, s) => m + s.assignments.length, 0), 0);
  const first = name.split(" ")[0] || name;

  return {
    title: `Internship Offer - ${name}`,
    kicker: "INTERNSHIP OFFER",
    reference: offer.referenceNo ?? undefined,
    date: offer.issuedAt,
    companyAddress: letterheadAddress(),
    recipient: [name, user.email],
    subject: `Offer to join the ${track.durationMonths}-Month ${track.title} Internship Program`,
    blocks: [
      { kind: "para", text: `Dear ${first},` },
      { kind: "para", text: `Congratulations on passing the final exam of the ${track.title} course with a score of ${offer.examScore}%. We are pleased to offer you a place as a participant in the Inveon Technologies ${track.durationMonths}-month ${track.title} Internship Program.` },
      {
        kind: "facts",
        rows: [
          ["Participant", name],
          ["Program", `${track.title} Internship Program`],
          ["Duration", `${track.durationMonths} months, starting the Monday after you join`],
          ["Mode", "Remote (India), with live sessions and mentor reviews"],
          ["Qualifying score", `${offer.examScore}% in the final exam`],
          ["Program fee", `${money(offer.fee)} (one-time)`],
          ["Assignments", `${assignmentCount} across ${phases.length} months`],
        ],
      },
      { kind: "heading", text: "What the program includes" },
      {
        kind: "bullets",
        items: [
          `A month-by-month roadmap covering ${[...new Set(phases.flatMap((p) => p.skills.map((s) => s.label)))].join(", ")}.`,
          "Practical assignments, each reviewed by a mentor who approves it with marks and feedback, or asks for changes.",
          "Live classes, the Inveon community chat, and tasks linked to real GitHub issues.",
          "Official onboarding as an Inveon intern: an employee ID, an appointment letter and access to the company portal.",
          "An Internship Completion Certificate, verifiable online, when you complete the program. Outstanding interns are considered for full-time roles.",
        ],
      },
      { kind: "heading", text: "Your roadmap" },
      { kind: "facts", rows: phases.map((p) => [`Month ${p.month}`, `${p.title}: ${p.skills.map((s) => s.label).join(", ")}`] as [string, string]) },
      { kind: "heading", text: "How to accept" },
      {
        kind: "clauses",
        items: [
          { title: "Pay the program fee", text: `Open the ${track.title} page under Internships in the Inveon portal and choose "Accept and pay". The fee of ${money(offer.fee)} is paid securely online through Cashfree (UPI, cards or net banking).` },
          { title: "Start your roadmap", text: "Your roadmap of assignments unlocks as soon as the payment is confirmed. Submit each assignment from the portal with a repository or live link." },
          { title: "Join as an intern", text: "You are onboarded as an Inveon intern with an employee ID. Your appointment letter and the company policies follow by email." },
        ],
      },
      {
        kind: "callout",
        title: "Terms",
        text: "The program fee is non-refundable once the program has started, except if Inveon cancels the program. Participation is governed by the Internship Program Policy and the other company policies shared with your appointment letter.",
      },
      { kind: "para", text: "We look forward to having you on the team." },
      { kind: "signatures", left: { caption: "For Inveon Technologies", name: "Talent and Training Team", title: "Authorised Signatory" } },
    ],
  };
}

export const offerPdf = async (db: Database, offer: ParticipantOffer) => renderLetterPdf(await offerDocument(db, offer));
export const offerFilename = (track: Pick<Track, "title">) => `Internship-Offer-${track.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;

export function registerInternshipJobs(db: Database, appUrl: string) {
  registerJobHandler("internship.offer_email", async (payload) => {
    const offer = await db.query.participantOffers.findFirst({ where: eq(participantOffers.id, String(payload.offerId)) });
    if (!offer) return;
    const track = (await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.id, offer.trackId) }))!;
    const user = (await db.query.users.findFirst({ where: eq(users.id, offer.userId) }))!;
    const first = (await displayNameFor(db, offer.userId)).split(" ")[0];
    await deliverEmail({
      to: user.email,
      subject: `Your offer: ${track.title} Internship Program (6 months)`,
      text: [
        `Dear ${first},`,
        "",
        `Congratulations! You passed the ${track.title} final exam with ${offer.examScore}%, and we're pleased to offer you a place in the 6-month ${track.title} Internship Program. Your offer letter (ref. ${offer.referenceNo}) is attached.`,
        "",
        `To accept, pay the one-time program fee of ${money(offer.fee)} in the portal. Your roadmap of assignments unlocks right away:`,
        `${appUrl}/internships/${track.slug}`,
        "",
        "Warm regards,",
        "Talent and Training Team",
        "Inveon Technologies",
      ].join("\n"),
      attachments: [{ filename: offerFilename(track), content: Buffer.from(await offerPdf(db, offer)), contentType: "application/pdf" }],
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
