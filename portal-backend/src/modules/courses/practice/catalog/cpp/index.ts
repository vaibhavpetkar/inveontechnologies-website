import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { control } from "./control.js";
import { functions } from "./functions.js";
import { collections } from "./collections.js";
import { oop } from "./oop.js";

export const cppCourse: PracticeCourse = {
  key: "cpp",
  title: "C++ Programming",
  category: "Programming languages",
  tagline: "Learn modern C++ from cin and cout to functions, references, vectors, classes, polymorphism, the STL, exceptions and file streams, with every assignment checked automatically.",
  docs: "https://en.cppreference.com/w/cpp",
  editor: "cpp",
  units: [basics, control, functions, collections, oop],
};
