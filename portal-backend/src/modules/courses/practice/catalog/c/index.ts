import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { decisions } from "./decisions.js";
import { loops } from "./loops.js";
import { arrays } from "./arrays.js";
import { functions } from "./functions.js";
import { files } from "./files.js";

export const cCourse: PracticeCourse = {
  key: "c",
  title: "C Programming",
  category: "Programming languages",
  tagline: "Learn C from your first printf to arrays, strings, functions, structures, pointers and files, with every assignment checked automatically.",
  docs: "https://en.cppreference.com/w/c",
  editor: "c",
  units: [basics, decisions, loops, arrays, functions, files],
};
