import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { control } from "./control.js";
import { functions } from "./functions.js";
import { arrays } from "./arrays.js";
import { strings } from "./strings.js";
import { objects } from "./objects.js";

export const javascriptCourse: PracticeCourse = {
  key: "javascript",
  title: "JavaScript",
  category: "Web development",
  tagline: "Learn modern JavaScript from variables and loops to functions, closures, array methods, classes, regular expressions, promises, async/await and the DOM, with every assignment checked automatically.",
  docs: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  editor: "javascript",
  units: [basics, control, functions, arrays, strings, objects],
};
