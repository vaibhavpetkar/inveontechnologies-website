import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, assessmentAttempts, assessmentQuestions, assessments, opportunities, users } from "../shared/db/schema.js";
import type { ApplicationStatus } from "../applications/state-machine.js";
import { applyApplicationTransition } from "../applications/transition-helper.js";
import { notify } from "../notifications/service.js";
import { notifyCandidate } from "../notifications/recruitment.js";

export interface ExamSummary {
  id: string;
  title: string;
  description: string | null;
  language: string | null;
  durationMinutes: number;
  passingScorePercent: number;
  maxAttempts: number;
  opensAt: Date | null;
  closesAt: Date | null;
  questionCount: number;
}

export type ExamWindow = "open" | "upcoming" | "closed";

/** Where an exam's window stands right now. An exam without a window is always open. */
export function examWindow(exam: { opensAt: Date | null; closesAt: Date | null }, now = new Date()): ExamWindow {
  if (exam.opensAt && now < exam.opensAt) return "upcoming";
  if (exam.closesAt && now >= exam.closesAt) return "closed";
  return "open";
}

/** Active exams on an opening that have at least one question — the ones a candidate can sit. */
export async function examsForOpportunity(db: Database, opportunityId: string): Promise<ExamSummary[]> {
  const rows = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      description: assessments.description,
      language: assessments.language,
      durationMinutes: assessments.durationMinutes,
      passingScorePercent: assessments.passingScorePercent,
      maxAttempts: assessments.maxAttempts,
      opensAt: assessments.opensAt,
      closesAt: assessments.closesAt,
      questionCount: sql<number>`(select count(*)::int from assessment_questions q where q.assessment_id = "assessments"."id")`,
    })
    .from(assessments)
    .where(and(eq(assessments.opportunityId, opportunityId), eq(assessments.isActive, true)))
    .orderBy(asc(assessments.language), asc(assessments.createdAt));
  return rows.filter((r) => r.questionCount > 0);
}

/** Attempts used per exam for one application. */
export async function attemptsUsedByExam(db: Database, applicationId: string) {
  const rows = await db
    .select({ assessmentId: assessmentAttempts.assessmentId, used: sql<number>`count(*)::int` })
    .from(assessmentAttempts)
    .where(eq(assessmentAttempts.applicationId, applicationId))
    .groupBy(assessmentAttempts.assessmentId);
  return new Map(rows.map((r) => [r.assessmentId, r.used]));
}

/**
 * Called right after a candidate applies: when the opening has an exam,
 * the application moves straight to "assessment_invited" and the
 * candidate is told to pick their exam. Openings without an exam keep the
 * normal review path.
 */
export async function inviteToExamsOnApply(db: Database, applicationId: string, opportunityId: string, actorUserId: string) {
  const exams = await examsForOpportunity(db, opportunityId);
  if (exams.length === 0) return false;
  await applyApplicationTransition(db, { applicationId, from: "submitted", to: "assessment_invited", actorUserId: null, note: "Opening has an exam: candidate invited automatically" });
  const languages = exams.map((e) => e.language).filter(Boolean);
  await notifyCandidate(db, applicationId, {
    kind: "assessment.invited",
    actorUserId,
    title: "Your exam is ready",
    body: (opp) => `Take the exam for ${opp}${languages.length > 1 ? ` in the language you're strongest in (${languages.join(", ")})` : ""}. The timer only starts when you press Start.`,
    link: `/assessments/${applicationId}`,
    email: true,
  });
  return true;
}

/**
 * After an attempt is scored (submitted or expired): a pass completes the
 * exam stage and tells the hiring team; a fail leaves the candidate
 * invited while any exam still has attempts left, otherwise the stage
 * completes as failed so the team can close it out.
 */
export async function resolveAfterAttempt(
  db: Database,
  params: { applicationId: string; assessmentId: string; scorePercent: number; passed: boolean; actorUserId: string | null },
) {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, params.applicationId) });
  if (!application || (application.status as ApplicationStatus) !== "assessment_invited") return;
  const exam = await db.query.assessments.findFirst({ where: eq(assessments.id, params.assessmentId) });
  const label = exam?.language ? `${exam.language} exam` : "exam";

  if (params.passed) {
    await applyApplicationTransition(db, {
      applicationId: application.id,
      from: "assessment_invited",
      to: "assessment_completed",
      actorUserId: params.actorUserId,
      note: `Passed the ${label} with ${params.scorePercent}%`,
    });
    await notifyHiringTeam(db, application.opportunityId, application.userId, {
      kind: "assessment.passed",
      title: "Candidate passed the exam",
      body: (who, opp) => `${who} scored ${params.scorePercent}% on the ${label} for ${opp}. Schedule their HR round.`,
      link: `/opportunities/${application.opportunityId}?applicant=${application.id}`,
    });
    return;
  }

  const exams = await examsForOpportunity(db, application.opportunityId);
  const used = await attemptsUsedByExam(db, application.id);
  // An exam whose window has closed can't be retried.
  const retriesLeft = exams.some((e) => examWindow(e) !== "closed" && (used.get(e.id) ?? 0) < e.maxAttempts);
  if (retriesLeft) {
    await notifyCandidate(db, application.id, {
      kind: "assessment.retry",
      actorUserId: params.actorUserId ?? undefined,
      title: "You can try the exam again",
      body: (opp) => `You scored ${params.scorePercent}% on the ${label} for ${opp}. You still have attempts left.`,
      link: `/assessments/${application.id}`,
    });
    return;
  }
  await applyApplicationTransition(db, {
    applicationId: application.id,
    from: "assessment_invited",
    to: "assessment_completed",
    actorUserId: params.actorUserId,
    note: `Did not pass the ${label} (${params.scorePercent}%) and has no attempts left`,
  });
}

/** HR, admins and whoever created the opening. */
export async function notifyHiringTeam(
  db: Database,
  opportunityId: string,
  candidateUserId: string,
  input: { kind: string; title: string; body: (candidate: string, opportunityTitle: string) => string; link: string },
) {
  const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId), columns: { title: true, createdBy: true } });
  const staff = await db.query.users.findMany({ where: inArray(users.role, ["hr", "admin", "super_admin"]), columns: { id: true } });
  const recipients = new Set(staff.map((u) => u.id));
  if (opportunity?.createdBy) recipients.add(opportunity.createdBy);
  const candidate = await db.query.users.findFirst({ where: eq(users.id, candidateUserId), columns: { email: true, fullName: true } });
  await notify(db, {
    userIds: [...recipients],
    actorUserId: candidateUserId,
    kind: input.kind,
    title: input.title,
    body: input.body(candidate?.fullName || candidate?.email || "A candidate", opportunity?.title ?? "an opening"),
    link: input.link,
  });
}

export function formatIst(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

/**
 * Exam window reminders for candidates still waiting on an exam: once when
 * it opens, and once when it closes within a day. Each reminder is sent
 * once per window (the dedupe key carries the time, so a moved window gets
 * fresh reminders).
 */
export async function sendExamWindowReminders(db: Database, now = new Date()) {
  const rows = await db.execute<{ exam_id: string; title: string; language: string | null; opens_at: string | null; closes_at: string | null; application_id: string; user_id: string; opportunity: string }>(sql`
    SELECT x.id AS exam_id, x.title, x.language, x.opens_at, x.closes_at, a.id AS application_id, a.user_id, o.title AS opportunity
    FROM assessments x
    JOIN opportunities o ON o.id = x.opportunity_id
    JOIN applications a ON a.opportunity_id = o.id AND a.status = 'assessment_invited'
    WHERE x.is_active = true
      AND ((x.opens_at <= ${now.toISOString()} AND x.opens_at > ${new Date(now.getTime() - 60 * 60 * 1000).toISOString()})
        OR (x.closes_at > ${now.toISOString()} AND x.closes_at <= ${new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()}))
      AND NOT EXISTS (
        SELECT 1 FROM assessment_attempts t
        WHERE t.application_id = a.id AND t.assessment_id = x.id
        GROUP BY t.assessment_id HAVING count(*) >= x.max_attempts
      )
  `);
  let sent = 0;
  for (const r of rows.rows) {
    const name = r.language ? `${r.language} exam` : `"${r.title}"`;
    const link = `/assessments/${r.application_id}`;
    const opensAt = r.opens_at ? new Date(r.opens_at) : null;
    const closesAt = r.closes_at ? new Date(r.closes_at) : null;
    if (opensAt && opensAt <= now && opensAt.getTime() > now.getTime() - 60 * 60 * 1000) {
      await notify(db, {
        userIds: [r.user_id],
        kind: "assessment.window_open",
        title: `Your ${name} is open`,
        body: closesAt ? `Take it for ${r.opportunity} before ${formatIst(closesAt)}.` : `You can take it for ${r.opportunity} now.`,
        link,
        email: true,
        dedupeKey: `exam-open:${r.exam_id}:${r.application_id}:${opensAt.getTime()}`,
      });
      sent++;
    }
    if (closesAt && closesAt > now && closesAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000 && (!opensAt || opensAt <= now)) {
      await notify(db, {
        userIds: [r.user_id],
        kind: "assessment.window_closing",
        title: `Your ${name} closes soon`,
        body: `It closes on ${formatIst(closesAt)}. Start it before then to finish in time.`,
        link,
        email: true,
        dedupeKey: `exam-closing:${r.exam_id}:${r.application_id}:${closesAt.getTime()}`,
      });
      sent++;
    }
  }
  return sent;
}
