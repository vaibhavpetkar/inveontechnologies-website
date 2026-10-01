import type { PracticeCourse } from "../../types.js";
import { files } from "./files.js";
import { text } from "./text.js";
import { permissions } from "./permissions.js";
import { processes } from "./processes.js";
import { networking } from "./networking.js";

export const linuxCourse: PracticeCourse = {
  key: "linux",
  title: "Linux and Shell Scripting",
  category: "DevOps and cloud",
  tagline: "Work confidently on a Linux server: navigate and search the file system, process text with grep, awk and sed, manage permissions, processes, services, SSH and packages, and automate it all with bash scripts.",
  docs: "https://www.gnu.org/software/bash/manual/",
  editor: "bash",
  units: [files, text, permissions, processes, networking],
};
