/** The auto-checked exercises for every skill, keyed like catalog-skills.ts. */
import type { ExerciseSeed } from "../types.js";
import htmlBank from "./html.js";
import cssBank from "./css.js";
import javascriptBank from "./javascript.js";
import bootstrapBank from "./bootstrap.js";
import reactBank from "./react.js";
import pythonBank from "./python.js";
import djangoBank from "./django.js";
import mysqlBank from "./mysql.js";
import cBank from "./c.js";
import cppBank from "./cpp.js";
import csharpBank from "./csharp.js";
import javacoreBank from "./java_core.js";
import javaadvancedBank from "./java_advanced.js";
import springbootBank from "./spring_boot.js";
import nodeexpressBank from "./node_express.js";
import devopsBank from "./devops.js";
import cloudBank from "./cloud.js";

export const EXERCISES: Record<string, ExerciseSeed[]> = {
  html: htmlBank,
  css: cssBank,
  javascript: javascriptBank,
  bootstrap: bootstrapBank,
  react: reactBank,
  python: pythonBank,
  django: djangoBank,
  mysql: mysqlBank,
  c: cBank,
  cpp: cppBank,
  csharp: csharpBank,
  java_core: javacoreBank,
  java_advanced: javaadvancedBank,
  spring_boot: springbootBank,
  node_express: nodeexpressBank,
  devops: devopsBank,
  cloud: cloudBank,
};
