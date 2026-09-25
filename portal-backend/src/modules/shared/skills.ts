import { eq } from "drizzle-orm";
import type { Database } from "./db/client.js";
import { skills } from "./db/schema.js";
import { slugify } from "./slugify.js";

/**
 * Resolves free-text skill names to skill ids, creating any that don't
 * exist yet. Names are de-duplicated by slug first — "React" and "react"
 * are the same skill, and inserting both into a (x, skillId) join table
 * would violate its primary key.
 */
export async function resolveSkillIds(db: Database, names: string[]): Promise<string[]> {
  const bySlug = new Map<string, string>();
  for (const rawName of names) {
    const name = rawName.trim();
    const slug = slugify(name);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, name);
  }

  const ids: string[] = [];
  for (const [slug, name] of bySlug) {
    const existing = await db.query.skills.findFirst({ where: eq(skills.slug, slug) });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    // onConflictDoNothing covers a concurrent request creating the same skill.
    const [created] = await db.insert(skills).values({ name, slug }).onConflictDoNothing().returning();
    const id = created?.id ?? (await db.query.skills.findFirst({ where: eq(skills.slug, slug) }))?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
