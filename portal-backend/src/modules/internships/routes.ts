import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  assignmentSubmissions,
  courseEnrollments,
  courseLessons,
  internshipTracks,
  lessonProgress,
  lessonQuizAttempts,
  participantOffers,
  programEnrollments,
  trackAssignments,
  users,
} from "../shared/db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { displayNameFor } from "../employees/onboarding.js";
import { cashfreeConfig } from "../payments/cashfree.js";
import { expireTrialIfDue } from "../payments/enrollments.js";
import type { Env } from "../shared/env.js";
import { SKILL_LABELS } from "./catalog-skills.js";
import { trackSkills } from "./catalog-tracks.js";
import { allocateRoadmap, assignmentsForSkills, installCatalog, offerFilename, offerPdf, trackStats, type Track } from "./service.js";

const REVIEWER_ROLES = ["manager", "hr", "admin", "super_admin"] as const;
const INSTALL_ROLES = ["admin", "super_admin"] as const;
const isReviewer = (role: string) => (REVIEWER_ROLES as readonly string[]).includes(role);
const UNLOCKED = ["paid", "waived"];

const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), "Use an http(s) link");
const submitSchema = z
  .object({
    repoUrl: url.nullable().optional().or(z.literal("")),
    linkUrl: url.nullable().optional().or(z.literal("")),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((b) => b.repoUrl || b.linkUrl || (b.notes && b.notes.length >= 20), "Add a repository or live link (or at least a short write-up)");

const reviewSchema = z.object({
  decision: z.enum(["approve", "changes"]),
  marks: z.number().int().min(0).max(100).nullable().optional(),
  feedback: z.string().trim().max(4000).nullable().optional(),
});

/** Where the caller stands on one track: course, exam, offer, fee. */
async function myState(db: Database, track: Track, userId: string) {
  const courseEnrollment = track.courseId ? await db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.courseId, track.courseId), eq(courseEnrollments.userId, userId)) }) : null;
  let course = null;
  let exam = null;
  if (courseEnrollment) {
    const progress = await db.query.lessonProgress.findMany({ where: eq(lessonProgress.enrollmentId, courseEnrollment.id) });
    course = { enrollmentId: courseEnrollment.id, status: courseEnrollment.status, done: progress.filter((p) => p.status === "completed").length, total: progress.length };
    if (track.examLessonId) {
      const attempts = await db.query.lessonQuizAttempts.findMany({ where: and(eq(lessonQuizAttempts.lessonId, track.examLessonId), eq(lessonQuizAttempts.enrollmentId, courseEnrollment.id), eq(lessonQuizAttempts.status, "submitted")) });
      const lesson = await db.query.courseLessons.findFirst({ where: eq(courseLessons.id, track.examLessonId) });
      exam = {
        attempts: attempts.length,
        attemptsLeft: lesson?.maxAttempts ? Math.max(0, lesson.maxAttempts - attempts.length) : null,
        best: attempts.length ? Math.max(...attempts.map((a) => a.scorePercent ?? 0)) : null,
        passed: attempts.some((a) => a.passed),
        passPercent: lesson?.passingScorePercent ?? null,
      };
    }
  }
  const row = track.opportunityId ? await db.query.programEnrollments.findFirst({ where: and(eq(programEnrollments.opportunityId, track.opportunityId), eq(programEnrollments.userId, userId)) }) : null;
  const enrollment = row ? await expireTrialIfDue(db, row) : null;
  const offer = enrollment ? await db.query.participantOffers.findFirst({ where: eq(participantOffers.enrollmentId, enrollment.id) }) : null;
  return {
    course,
    exam,
    offer: offer ? { id: offer.id, referenceNo: offer.referenceNo, examScore: offer.examScore, fee: Number(offer.fee), issuedAt: offer.issuedAt } : null,
    enrollment: enrollment ? { id: enrollment.id, status: enrollment.status, paidAt: enrollment.paidAt, applicationId: enrollment.applicationId } : null,
    unlocked: !!enrollment && UNLOCKED.includes(enrollment.status),
  };
}

function publicTrack(track: Track) {
  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    tagline: track.tagline,
    description: track.description,
    fee: Number(track.fee),
    durationMonths: track.durationMonths,
    courseId: track.courseId,
    opportunityId: track.opportunityId,
    roadmap: track.roadmap.map((p) => ({ ...p, labels: p.skills.map((s) => SKILL_LABELS[s] ?? s) })),
  };
}

export function internshipsRouter(db: Database, env: Env) {
  const router = Router();
  const cashfree = cashfreeConfig(env);

  const trackBySlug = async (slug: string) => {
    const track = await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.slug, slug) });
    if (!track || !track.active) throw new NotFoundError("Internship track not found");
    return track;
  };

  router.get("/", requireAuth(env), async (req, res) => {
    const tracks = await db.query.internshipTracks.findMany({ where: eq(internshipTracks.active, true), orderBy: asc(internshipTracks.orderIndex) });
    const counts = await db.execute<{ skill: string; n: number }>(sql`SELECT skill, count(*)::int AS n FROM track_assignments WHERE active GROUP BY skill`);
    const bySkill = new Map(counts.rows.map((r) => [r.skill, r.n]));
    const interns = isReviewer(req.user!.role) ? await trackStats(db) : null;
    res.json({
      tracks: await Promise.all(
        tracks.map(async (t) => ({
          ...publicTrack(t),
          assignmentCount: trackSkills(t.roadmap).reduce((n, s) => n + (bySkill.get(s) ?? 0), 0),
          interns: interns?.get(t.id) ?? undefined,
          me: await myState(db, t, req.user!.sub),
        })),
      ),
      canInstall: (INSTALL_ROLES as readonly string[]).includes(req.user!.role),
    });
  });

  /** One-time setup of the six tracks with their courses, exams, openings and assignments. */
  router.post("/install", requireAuth(env), requireRole(...INSTALL_ROLES), async (req, res) => {
    const created = await installCatalog(db, req.user!.sub);
    res.status(created.length ? 201 : 200).json({ created });
  });

  // ---- Reviewing (mentors) — declared before /:slug ----

  router.get("/reviews/queue", requireAuth(env), requireRole(...REVIEWER_ROLES), async (req, res) => {
    const { status, track } = z.object({ status: z.enum(["submitted", "changes_requested", "approved"]).default("submitted"), track: z.string().max(100).optional() }).parse(req.query);
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT s.id, s.status, s.repo_url AS "repoUrl", s.link_url AS "linkUrl", s.notes, s.attempt, s.marks, s.feedback,
             s.submitted_at AS "submittedAt", s.reviewed_at AS "reviewedAt",
             a.id AS "assignmentId", a.title, a.brief, a.steps, a.skill, a.level, a.deliverable, a.max_marks AS "maxMarks",
             t.slug AS "trackSlug", t.title AS "trackTitle",
             u.id AS "userId", u.email,
             coalesce(u.full_name, cp.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name,
             coalesce(r.full_name, r.email) AS "reviewedBy"
      FROM assignment_submissions s
      JOIN track_assignments a ON a.id = s.assignment_id
      JOIN program_enrollments pe ON pe.id = s.enrollment_id
      JOIN internship_tracks t ON t.opportunity_id = pe.opportunity_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      LEFT JOIN users r ON r.id = s.reviewed_by
      WHERE s.status = ${status} ${track ? sql`AND t.slug = ${track}` : sql``}
      ORDER BY ${status === "submitted" ? sql`s.submitted_at ASC` : sql`coalesce(s.reviewed_at, s.submitted_at) DESC`}
      LIMIT 200
    `);
    const [counts] = (
      await db.execute<{ submitted: number; changes: number; approved: number }>(sql`
        SELECT count(*) FILTER (WHERE status = 'submitted')::int AS submitted,
               count(*) FILTER (WHERE status = 'changes_requested')::int AS changes,
               count(*) FILTER (WHERE status = 'approved')::int AS approved
        FROM assignment_submissions
      `)
    ).rows;
    res.json({ submissions: rows.rows.map((r) => ({ ...r, skillLabel: SKILL_LABELS[r.skill as string] ?? r.skill })), counts });
  });

  /** Each intern's progress on their track: approved, waiting, marks. */
  router.get("/reviews/interns", requireAuth(env), requireRole(...REVIEWER_ROLES), async (_req, res) => {
    const tracks = await db.query.internshipTracks.findMany();
    const oppIds = tracks.map((t) => t.opportunityId).filter((x): x is string => !!x);
    if (!oppIds.length) {
      res.json({ interns: [] });
      return;
    }
    const enrollments = await db.query.programEnrollments.findMany({ where: and(inArray(programEnrollments.opportunityId, oppIds), inArray(programEnrollments.status, ["paid", "waived"])), orderBy: desc(programEnrollments.paidAt) });
    const allSkills = [...new Set(tracks.flatMap((t) => trackSkills(t.roadmap)))];
    const bank = await assignmentsForSkills(db, allSkills);
    const subs = enrollments.length ? await db.query.assignmentSubmissions.findMany({ where: inArray(assignmentSubmissions.enrollmentId, enrollments.map((e) => e.id)) }) : [];
    const interns = await Promise.all(
      enrollments.map(async (e) => {
        const track = tracks.find((t) => t.opportunityId === e.opportunityId)!;
        const assignments = trackSkills(track.roadmap).flatMap((s) => bank.get(s) ?? []);
        const mine = subs.filter((s) => s.enrollmentId === e.id);
        const approved = mine.filter((s) => s.status === "approved");
        const user = await db.query.users.findFirst({ where: eq(users.id, e.userId), columns: { email: true } });
        return {
          enrollmentId: e.id,
          userId: e.userId,
          name: await displayNameFor(db, e.userId),
          email: user?.email ?? "",
          track: { slug: track.slug, title: track.title },
          joinedAt: e.paidAt ?? e.updatedAt,
          total: assignments.length,
          approved: approved.length,
          waiting: mine.filter((s) => s.status === "submitted").length,
          changes: mine.filter((s) => s.status === "changes_requested").length,
          marks: approved.reduce((n, s) => n + (s.marks ?? 0), 0),
          maxMarks: assignments.reduce((n, a) => n + a.maxMarks, 0),
        };
      }),
    );
    res.json({ interns });
  });

  router.post("/submissions/:id/review", requireAuth(env), requireRole(...REVIEWER_ROLES), async (req, res) => {
    const body = reviewSchema.parse(req.body);
    const submission = await db.query.assignmentSubmissions.findFirst({ where: eq(assignmentSubmissions.id, req.params.id) });
    if (!submission) throw new NotFoundError("Submission not found");
    if (submission.userId === req.user!.sub) throw new ForbiddenError("You can't review your own work");
    if (submission.status !== "submitted") throw new AppError("NOT_WAITING", "This submission isn't waiting for review", 409);
    const assignment = (await db.query.trackAssignments.findFirst({ where: eq(trackAssignments.id, submission.assignmentId) }))!;
    if (body.decision === "approve") {
      if (body.marks === null || body.marks === undefined) throw new AppError("MARKS_REQUIRED", "Give marks when you approve", 400);
      if (body.marks > assignment.maxMarks) throw new AppError("MARKS_TOO_HIGH", `Marks can be at most ${assignment.maxMarks}`, 400);
    } else if (!body.feedback || body.feedback.length < 5) {
      throw new AppError("FEEDBACK_REQUIRED", "Say what needs changing", 400);
    }

    const now = new Date();
    const [updated] = await db
      .update(assignmentSubmissions)
      .set({ status: body.decision === "approve" ? "approved" : "changes_requested", marks: body.decision === "approve" ? body.marks! : null, feedback: body.feedback || null, reviewedBy: req.user!.sub, reviewedAt: now })
      .where(and(eq(assignmentSubmissions.id, submission.id), eq(assignmentSubmissions.status, "submitted")))
      .returning();
    if (!updated) throw new AppError("NOT_WAITING", "Someone else just reviewed this", 409);

    const enrollment = (await db.query.programEnrollments.findFirst({ where: eq(programEnrollments.id, submission.enrollmentId) }))!;
    const track = await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.opportunityId, enrollment.opportunityId) });
    await notify(db, {
      userIds: [submission.userId],
      actorUserId: req.user!.sub,
      kind: body.decision === "approve" ? "assignment.approved" : "assignment.changes",
      title: body.decision === "approve" ? `Approved: ${assignment.title} (${body.marks}/${assignment.maxMarks})` : `Changes requested: ${assignment.title}`,
      body: body.feedback ?? (body.decision === "approve" ? "Nice work. On to the next one!" : undefined),
      link: track ? `/internships/${track.slug}?assignment=${assignment.id}` : "/internships",
      email: true,
    });
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: `assignment.${body.decision}`, entityType: "assignment_submission", entityId: submission.id, metadata: { marks: body.marks ?? null }, ipAddress: req.ip });

    // Everything on the roadmap approved: the internship can be completed.
    if (track && body.decision === "approve") {
      const required = trackSkills(track.roadmap);
      const [{ total, approved }] = (
        await db.execute<{ total: number; approved: number }>(sql`
          SELECT (SELECT count(*)::int FROM track_assignments WHERE active AND skill IN (${sql.join(required.map((s) => sql`${s}`), sql`, `)})) AS total,
                 (SELECT count(*)::int FROM assignment_submissions WHERE enrollment_id = ${enrollment.id} AND status = 'approved') AS approved
        `)
      ).rows;
      if (approved >= total) {
        const who = await displayNameFor(db, submission.userId);
        const staff = await db.query.users.findMany({ where: inArray(users.role, ["hr", "admin", "super_admin"]), columns: { id: true } });
        await notify(db, {
          userIds: staff.map((s) => s.id),
          kind: "internship.roadmap_done",
          title: `${who} finished the ${track.title} roadmap`,
          body: "Every assignment is approved. Issue their internship completion certificate from the People page.",
          link: "/people",
          dedupeKey: `roadmap-done:${enrollment.id}`,
          email: true,
        });
        await notify(db, { userIds: [submission.userId], kind: "internship.roadmap_done", title: "You've completed your roadmap!", body: `Every ${track.title} assignment is approved. Well done!`, link: `/internships/${track.slug}`, dedupeKey: `roadmap-done-me:${enrollment.id}` });
      }
    }
    res.json({ submission: updated });
  });

  // ---- The participant's track page ----

  router.get("/offers/:id/pdf", requireAuth(env), async (req, res) => {
    const offer = await db.query.participantOffers.findFirst({ where: eq(participantOffers.id, req.params.id) });
    if (!offer) throw new NotFoundError("Offer not found");
    if (offer.userId !== req.user!.sub && !isReviewer(req.user!.role)) throw new ForbiddenError();
    const track = (await db.query.internshipTracks.findFirst({ where: eq(internshipTracks.id, offer.trackId) }))!;
    const pdf = await offerPdf(db, offer);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${offerFilename(track)}"`);
    res.send(Buffer.from(pdf));
  });

  router.post("/assignments/:id/submit", requireAuth(env), async (req, res) => {
    const body = submitSchema.parse(req.body);
    const assignment = await db.query.trackAssignments.findFirst({ where: eq(trackAssignments.id, req.params.id) });
    if (!assignment || !assignment.active) throw new NotFoundError("Assignment not found");

    // The assignment must be on a track the caller has unlocked.
    const mine = await db.query.programEnrollments.findMany({ where: and(eq(programEnrollments.userId, req.user!.sub), inArray(programEnrollments.status, ["paid", "waived"])) });
    const tracks = mine.length ? await db.query.internshipTracks.findMany({ where: inArray(internshipTracks.opportunityId, mine.map((e) => e.opportunityId)) }) : [];
    const track = tracks.find((t) => trackSkills(t.roadmap).includes(assignment.skill));
    if (!track) throw new AppError("ROADMAP_LOCKED", "This assignment unlocks once you've joined an internship program that includes it", 403);
    const enrollment = mine.find((e) => e.opportunityId === track.opportunityId)!;

    const existing = await db.query.assignmentSubmissions.findFirst({ where: and(eq(assignmentSubmissions.assignmentId, assignment.id), eq(assignmentSubmissions.userId, req.user!.sub)) });
    if (existing?.status === "approved") throw new AppError("ALREADY_APPROVED", "This assignment is already approved", 409);
    const values = { repoUrl: body.repoUrl || null, linkUrl: body.linkUrl || null, notes: body.notes || null, status: "submitted" as const, submittedAt: new Date() };
    const [submission] = existing
      ? await db.update(assignmentSubmissions).set({ ...values, attempt: existing.attempt + 1 }).where(eq(assignmentSubmissions.id, existing.id)).returning()
      : await db.insert(assignmentSubmissions).values({ ...values, assignmentId: assignment.id, userId: req.user!.sub, enrollmentId: enrollment.id }).returning();

    const opportunity = await db.query.opportunities.findFirst({ where: (o, { eq: e }) => e(o.id, track.opportunityId!) });
    const mentors = opportunity?.hiringManagerId ? [opportunity.hiringManagerId] : (await db.query.users.findMany({ where: inArray(users.role, ["hr", "admin", "super_admin"]), columns: { id: true } })).map((u) => u.id);
    const who = await displayNameFor(db, req.user!.sub);
    await notify(db, {
      userIds: mentors,
      actorUserId: req.user!.sub,
      kind: "assignment.submitted",
      title: `${existing ? "Resubmitted" : "New submission"}: ${assignment.title}`,
      body: `${who} · ${track.title} · ${SKILL_LABELS[assignment.skill] ?? assignment.skill}`,
      link: "/reviews",
    });
    res.status(existing ? 200 : 201).json({ submission });
  });

  router.get("/:slug", requireAuth(env), async (req, res) => {
    const track = await trackBySlug(req.params.slug);
    const me = await myState(db, track, req.user!.sub);
    const bank = await assignmentsForSkills(db, trackSkills(track.roadmap));
    const subs = me.enrollment ? await db.query.assignmentSubmissions.findMany({ where: eq(assignmentSubmissions.enrollmentId, me.enrollment.id) }) : [];
    const bySub = new Map(subs.map((s) => [s.assignmentId, s]));
    const phases = allocateRoadmap(track.roadmap, bank).map((p) => ({
      ...p,
      skills: p.skills.map((s) => ({
        ...s,
        assignments: s.assignments.map((a) => {
          const sub = bySub.get(a.id);
          return {
            id: a.id,
            title: a.title,
            brief: a.brief,
            steps: a.steps,
            level: a.level,
            deliverable: a.deliverable,
            maxMarks: a.maxMarks,
            submission: sub ? { id: sub.id, status: sub.status, repoUrl: sub.repoUrl, linkUrl: sub.linkUrl, notes: sub.notes, attempt: sub.attempt, marks: sub.marks, feedback: sub.feedback, submittedAt: sub.submittedAt, reviewedAt: sub.reviewedAt } : null,
          };
        }),
      })),
    }));
    const all = phases.flatMap((p) => p.skills.flatMap((s) => s.assignments));
    const approved = all.filter((a) => a.submission?.status === "approved");
    res.json({
      track: publicTrack(track),
      me,
      phases,
      progress: {
        total: all.length,
        approved: approved.length,
        waiting: all.filter((a) => a.submission?.status === "submitted").length,
        changes: all.filter((a) => a.submission?.status === "changes_requested").length,
        marks: approved.reduce((n, a) => n + (a.submission!.marks ?? 0), 0),
        maxMarks: all.reduce((n, a) => n + a.maxMarks, 0),
      },
      payments: { enabled: !!cashfree, mode: cashfree?.mode ?? null },
    });
  });

  return router;
}
