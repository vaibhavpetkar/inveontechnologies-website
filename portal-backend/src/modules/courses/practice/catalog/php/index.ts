import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { control } from "./control.js";
import { functions } from "./functions.js";
import { arrays } from "./arrays.js";
import { web } from "./web.js";

export const phpCourse: PracticeCourse = {
  key: "php",
  title: "PHP Programming",
  category: "Backend frameworks",
  tagline: "Learn PHP from variables and control flow to functions, arrays, forms, sessions and safe database code, with every assignment checked automatically.",
  docs: "https://www.php.net/manual/en/",
  editor: "php",
  units: [basics, control, functions, arrays, web],
};
