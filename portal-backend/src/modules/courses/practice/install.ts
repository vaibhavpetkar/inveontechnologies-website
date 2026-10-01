import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../shared/db/client.js";
import { courseLessons, courseModules, courses, lessonCodeQuestions, lessonQuizQuestions } from "../../shared/db/schema.js";
import { slugify } from "../../shared/slugify.js";
import { logger } from "../../shared/logger.js";
import { PRACTICE_COURSES } from "./catalog/index.js";
import type { PracticeCourse, PracticeUnit, QuizSeed } from "./types.js";

export const QUIZ_PASS_PERCENT = 70;
export const FINAL_PASS_PERCENT = 60;
export const FINAL_MINUTES = 30;
export const FINAL_ATTEMPTS = 3;
/** How many questions of each unit's quiz (its last ones, the deeper ones) go into the final exam. */
const FINAL_PER_UNIT = 3;

const LANGUAGE_WORDS: Record<string, string> = { c: "C", cpp: "C++", java: "Java", python: "Python", javascript: "JavaScript", php: "PHP", sql: "SQL", html: "HTML", css: "CSS", bash: "shell", shell: "shell", yaml: "YAML", dockerfile: "Dockerfile", jsx: "JSX", json: "JSON", text: "text" };

export const questionCount = (c: PracticeCourse) => c.units.reduce((n, u) => n + u.questions.length, 0);
export const quizCount = (c: PracticeCourse) => c.units.reduce((n, u) => n + u.quiz.length, 0);
const finalQuestions = (c: PracticeCourse) => c.units.flatMap((u) => u.quiz.slice(-FINAL_PER_UNIT));

/** The course description, written from the catalog so it always matches the content. */
export function describeCourse(c: PracticeCourse): string {
  const questions = questionCount(c);
  return [
    `${c.tagline}`,
    `This course has ${c.units.length} units. Each unit has study notes to read, an assignment sheet of coding questions and a quiz. In all: ${questions} assignment questions and ${quizCount(c)} quiz questions, then a ${FINAL_MINUTES}-minute final exam.`,
    `How assignments work: for every question you upload your ${LANGUAGE_WORDS[c.editor] ?? ""} file (or write the code in the portal). It is reviewed automatically, line by line: the reviewer points at the exact lines with mistakes and explains how to fix them, then runs your program against test cases. If a question fails, you also get the review by email. Fix it and upload again as many times as you need.`,
    `What you will learn:\n${c.units.map((u, i) => `${i + 1}. ${u.title}: ${u.summary}`).join("\n")}`,
    `Pass every unit quiz (${QUIZ_PASS_PERCENT}%), every assignment question and the final exam (${FINAL_PASS_PERCENT}%) to complete the course. Official documentation: ${c.docs}`,
  ].join("\n\n");
}

const lessonKey = (c: PracticeCourse, u: PracticeUnit | null, part: string) => (u ? `${c.key}/${u.key}/${part}` : `${c.key}/${part}`);

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

function quizRows(lessonId: string, quiz: QuizSeed[]) {
  const letters = "abcdefgh";
  return quiz.map((q, i) => ({
    lessonId,
    questionText: q.q,
    options: q.options.map((text, k) => ({ id: letters[k], text })),
    correctOptionId: letters[q.answer],
    explanation: q.why,
    points: 1,
    orderIndex: i,
  }));
}

/** Writes an assignment lesson's questions: new ones added, existing ones kept in step with the code (by key). */
export async function syncQuestions(db: Db, lessonId: string, unit: PracticeUnit) {
  if (!unit.questions.length) return;
  await db
    .insert(lessonCodeQuestions)
    .values(
      unit.questions.map((q, i) => ({
        lessonId,
        key: slugify(q.title),
        title: q.title,
        brief: q.brief,
        steps: q.steps,
        level: q.level ?? "basic",
        spec: { editor: q.editor, starter: q.starter, check: q.check },
        orderIndex: i,
      })),
    )
    .onConflictDoUpdate({
      target: [lessonCodeQuestions.lessonId, lessonCodeQuestions.key],
      set: { title: sql`excluded.title`, brief: sql`excluded.brief`, steps: sql`excluded.steps`, level: sql`excluded.level`, spec: sql`excluded.spec`, orderIndex: sql`excluded.order_index` },
    });
}

async function lessonByKey(db: Db, key: string) {
  return db.query.courseLessons.findFirst({ where: eq(courseLessons.catalogKey, key) });
}

/**
 * Installs one practice course, or adds what's new to an installed one:
 * missing units and lessons are created, assignment questions are synced,
 * and quizzes are filled only when they have no questions (staff edits to
 * titles, text and quizzes are kept).
 */
async function installOne(db: Database, c: PracticeCourse, adminUserId: string): Promise<"created" | "updated"> {
  return db.transaction(async (tx) => {
    let course = await tx.query.courses.findFirst({ where: eq(courses.catalogKey, c.key) });
    const created = !course;
    if (!course) {
      [course] = await tx
        .insert(courses)
        .values({ title: c.title, description: describeCourse(c), status: "published", publishedAt: new Date(), priceAmount: "0", category: c.category, catalogKey: c.key, createdBy: adminUserId })
        .returning();
    }
    const courseId = course.id;

    for (const [i, unit] of c.units.entries()) {
      const reading = await lessonByKey(tx, lessonKey(c, unit, "reading"));
      const assignment = await lessonByKey(tx, lessonKey(c, unit, "assignment"));
      const quiz = await lessonByKey(tx, lessonKey(c, unit, "quiz"));
      let moduleId = reading?.moduleId ?? assignment?.moduleId ?? quiz?.moduleId;
      if (!moduleId) {
        [{ id: moduleId }] = await tx.insert(courseModules).values({ courseId, title: `${i + 1}. ${unit.title}`, orderIndex: i + 1 }).returning({ id: courseModules.id });
      }
      if (!reading) {
        const words = unit.reading.split(/\s+/).length;
        await tx.insert(courseLessons).values({ moduleId, title: `Reading: ${unit.title}`, contentType: "document", contentText: unit.reading, durationMinutes: Math.max(5, Math.round(words / 150)), orderIndex: 0, catalogKey: lessonKey(c, unit, "reading") });
      }
      if (unit.questions.length) {
        const lesson =
          assignment ??
          (
            await tx
              .insert(courseLessons)
              .values({
                moduleId,
                title: `Assignment ${i + 1}: ${unit.title}`,
                contentType: "assignment",
                contentText: `Topic covered: ${unit.summary}\n\nUpload a file for each question (or write the code here). Every upload is reviewed line by line and run against test cases. The assignment is complete when every question passes.`,
                durationMinutes: unit.questions.length * 10,
                orderIndex: 1,
                catalogKey: lessonKey(c, unit, "assignment"),
              })
              .returning()
          )[0];
        await syncQuestions(tx, lesson.id, unit);
      }
      if (unit.quiz.length) {
        let lesson = quiz;
        if (!lesson) {
          [lesson] = await tx
            .insert(courseLessons)
            .values({ moduleId, title: `Quiz: ${unit.title}`, contentType: "test", contentText: `${unit.quiz.length} questions. Score ${QUIZ_PASS_PERCENT}% or more to pass; you can retake it.`, durationMinutes: Math.max(5, unit.quiz.length), passingScorePercent: QUIZ_PASS_PERCENT, orderIndex: 2, catalogKey: lessonKey(c, unit, "quiz") })
            .returning();
        }
        const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lesson_quiz_questions WHERE lesson_id = ${lesson.id}`)).rows;
        if (n === 0) await tx.insert(lessonQuizQuestions).values(quizRows(lesson.id, unit.quiz));
      }
    }

    const finalQs = finalQuestions(c);
    if (finalQs.length) {
      let exam = await lessonByKey(tx, lessonKey(c, null, "final"));
      if (!exam) {
        const [mod] = await tx.insert(courseModules).values({ courseId, title: "Final exam", orderIndex: c.units.length + 1 }).returning();
        [exam] = await tx
          .insert(courseLessons)
          .values({ moduleId: mod.id, title: `${c.title} final exam`, contentType: "test", contentText: `${finalQs.length} questions from every unit, ${FINAL_MINUTES} minutes, ${FINAL_PASS_PERCENT}% to pass, ${FINAL_ATTEMPTS} attempts.`, durationMinutes: FINAL_MINUTES, passingScorePercent: FINAL_PASS_PERCENT, timeLimitMinutes: FINAL_MINUTES, maxAttempts: FINAL_ATTEMPTS, catalogKey: lessonKey(c, null, "final") })
          .returning();
      } else {
        // Keep the exam after any units added since it was created.
        await tx.update(courseModules).set({ orderIndex: c.units.length + 1 }).where(eq(courseModules.id, exam.moduleId));
      }
      const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lesson_quiz_questions WHERE lesson_id = ${exam.id}`)).rows;
      if (n === 0) await tx.insert(lessonQuizQuestions).values(quizRows(exam.id, finalQs));
    }
    return created ? "created" : "updated";
  });
}

/** Installs (or tops up) the practice courses; all of them when no keys are given. */
export async function installPracticeCourses(db: Database, adminUserId: string, keys?: string[]) {
  const wanted = PRACTICE_COURSES.filter((c) => !keys?.length || keys.includes(c.key));
  const created: string[] = [];
  const updated: string[] = [];
  for (const c of wanted) (await installOne(db, c, adminUserId)) === "created" ? created.push(c.key) : updated.push(c.key);
  return { created, updated };
}

/** Which practice courses are installed, by catalog key. */
export async function installedPracticeCourses(db: Database) {
  const keys = PRACTICE_COURSES.map((c) => c.key);
  const rows = await db.query.courses.findMany({ where: inArray(courses.catalogKey, keys), columns: { id: true, catalogKey: true, status: true } });
  return new Map(rows.map((r) => [r.catalogKey!, r]));
}

/**
 * Keeps installed assignment questions in step with the code (fixed tests,
 * new questions), once per process, the first time an assignment is opened.
 */
export async function syncInstalledQuestions(db: Database) {
  for (const c of PRACTICE_COURSES) {
    for (const unit of c.units) {
      const lesson = await db.query.courseLessons.findFirst({ where: and(eq(courseLessons.catalogKey, lessonKey(c, unit, "assignment"))) });
      if (lesson) await syncQuestions(db, lesson.id, unit);
    }
  }
}

let synced: Promise<void> | null = null;
export function ensureQuestionsSynced(db: Database) {
  synced ??= syncInstalledQuestions(db).catch((err) => {
    synced = null;
    logger.error({ err }, "syncing practice assignment questions failed");
  });
  return synced;
}
