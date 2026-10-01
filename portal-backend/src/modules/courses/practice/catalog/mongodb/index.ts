import type { PracticeCourse } from "../../types.js";
import { basics } from "./basics.js";
import { crud } from "./crud.js";
import { operators } from "./operators.js";
import { indexes } from "./indexes.js";
import { aggregation } from "./aggregation.js";
import { modeling } from "./modeling.js";

export const mongodbCourse: PracticeCourse = {
  key: "mongodb",
  title: "MongoDB",
  category: "Databases",
  tagline: "Store and query data as documents with MongoDB: CRUD in mongosh, query operators, indexes, the aggregation pipeline, schema design and Mongoose models in Node.js.",
  docs: "https://www.mongodb.com/docs/manual/",
  editor: "javascript",
  units: [basics, crud, operators, indexes, aggregation, modeling],
};
