/** Every practice course, in the order they are listed. */
import type { PracticeCourse } from "../types.js";
import { awsCourse } from "./aws/index.js";
import { bootstrapCourse } from "./bootstrap/index.js";
import { cCourse } from "./c/index.js";
import { cicdCourse } from "./cicd/index.js";
import { cppCourse } from "./cpp/index.js";
import { htmlCourse } from "./html/index.js";
import { javascriptCourse } from "./javascript/index.js";
import { linuxCourse } from "./linux/index.js";
import { mongodbCourse } from "./mongodb/index.js";
import { phpCourse } from "./php/index.js";
import { pythonCourse } from "./python/index.js";

export const PRACTICE_COURSES: PracticeCourse[] = [
  cCourse,
  cppCourse,
  pythonCourse,
  javascriptCourse,
  phpCourse,
  htmlCourse,
  bootstrapCourse,
  mongodbCourse,
  linuxCourse,
  cicdCourse,
  awsCourse,
];
