/**
 * Practice courses: one course per technology (C, Python, Docker, AWS ...),
 * installed from code like the internship catalog. Each unit becomes a
 * module with three lessons:
 *
 * - Reading: the study notes (see renderReading in the frontend for the
 *   format: blank-line paragraphs, "## " headings, "- " bullets and ```
 *   code blocks).
 * - Assignment: an assignment sheet of coding questions. The learner
 *   uploads a file per question; it's reviewed line by line and run
 *   against test cases (internships/exercises).
 * - Quiz: multiple-choice questions with explanations.
 *
 * A timed final exam at the end draws the last questions of each unit's quiz.
 */
import type { EditorLanguage, ExerciseSeed } from "../../internships/exercises/types.js";

export interface QuizSeed {
  q: string;
  options: string[];
  /** Index into options. */
  answer: number;
  why: string;
}

export interface PracticeUnit {
  key: string;
  title: string;
  /** What the unit covers, one line (shown in the course description). */
  summary: string;
  reading: string;
  questions: ExerciseSeed[];
  quiz: QuizSeed[];
}

export interface PracticeCourse {
  key: string;
  title: string;
  category: string;
  /** One sentence: what the learner can do after the course. */
  tagline: string;
  /** Official documentation to learn from. */
  docs: string;
  /** The editor language of most questions (drives the upload's file types). */
  editor: EditorLanguage;
  units: PracticeUnit[];
}
