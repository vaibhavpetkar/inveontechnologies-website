import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import type { Env } from "../env.js";

export function createDb(env: Env) {
  if (!env.PORTAL_DATABASE_URL) {
    throw new Error("PORTAL_DATABASE_URL is required to create a DB connection");
  }
  const pool = new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDb>["db"];
