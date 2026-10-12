import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.INVEON_DATABASE_URL ?? "postgres://portal:portal@localhost:5432/inveon_cloud_dev",
  },
});
