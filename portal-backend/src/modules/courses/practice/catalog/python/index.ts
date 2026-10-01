import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { conditions } from "./conditions.js";
import { loops } from "./loops.js";
import { strings } from "./strings.js";
import { collections } from "./collections.js";
import { functions } from "./functions.js";
import { oop } from "./oop.js";

export const pythonCourse: PracticeCourse = {
  key: "python",
  title: "Python Programming",
  category: "Programming languages",
  tagline: "Learn Python from your first print to strings, collections, functions, files, exceptions and classes, with every assignment run and checked automatically.",
  docs: "https://docs.python.org/3/",
  editor: "python",
  units: [basics, conditions, loops, strings, collections, functions, oop],
};
