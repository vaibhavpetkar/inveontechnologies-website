import type { PracticeCourse } from "../../types.js";
import { grid } from "./grid.js";
import { utilities } from "./utilities.js";
import { components } from "./components.js";
import { navigation } from "./navigation.js";
import { forms } from "./forms.js";

export const bootstrapCourse: PracticeCourse = {
  key: "bootstrap",
  title: "Bootstrap 5",
  category: "Web development",
  tagline: "Build responsive, good-looking pages with Bootstrap 5.3: the grid, utilities, components, navbars, forms, modals and theming, with every assignment checked automatically.",
  docs: "https://getbootstrap.com/docs/5.3/",
  editor: "html",
  units: [grid, utilities, components, navigation, forms],
};
