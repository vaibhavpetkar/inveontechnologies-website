import type { PracticeCourse } from "../../types.js";
import { structure } from "./structure.js";
import { links } from "./links.js";
import { media } from "./media.js";
import { tables } from "./tables.js";
import { forms } from "./forms.js";
import { semantic } from "./semantic.js";
import { a11y } from "./a11y.js";

export const htmlCourse: PracticeCourse = {
  key: "html",
  title: "HTML5",
  category: "Web development",
  tagline: "Build complete, semantic and accessible HTML5 pages, from your first tag to forms, media, tables and SEO-ready landing pages, with every assignment checked automatically.",
  docs: "https://developer.mozilla.org/en-US/docs/Web/HTML",
  editor: "html",
  units: [structure, links, media, tables, forms, semantic, a11y],
};
