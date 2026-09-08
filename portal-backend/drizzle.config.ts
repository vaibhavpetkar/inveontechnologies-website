import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/modules/shared/db/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.PORTAL_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/portal_dev",
  },
});
