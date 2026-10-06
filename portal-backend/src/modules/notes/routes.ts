import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { noteShares, notes, users } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { AppError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { writeAuditLog } from "../shared/audit.js";
import { notify } from "../notifications/service.js";
import { canAccessProject } from "../projects/routes.js";
import type { Env } from "../shared/env.js";
import { decryptSecret, encryptSecret, vaultKey } from "./crypto.js";

/**
 * Notes: planning notes, important notes, bookmarks and shared secrets.
 * Private to the owner unless shared with named people (view or edit).
 * Secret values never appear in a list or a note read; they're decrypted
 * only by the reveal endpoint, for the owner or someone it's shared with,
 * and every reveal is audit-logged. Staff only: candidates have no notes.
 */
const KINDS = ["note", "plan", "bookmark", "secret"] as const;

const shareSchema = z.object({ userId: z.string().uuid(), canEdit: z.boolean().default(false) });

const noteSchema = z.object({
  kind: z.enum(KINDS).default("note"),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).nullable().optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  username: z.string().trim().max(300).nullable().optional(),
  // Secrets only: the value to encrypt. Omit on update to keep the stored one.
  secret: z.string().max(5000).optional(),
  important: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  projectId: z.string().uuid().nullable().optional(),
  shares: z.array(shareSchema).max(200).optional(),
});

type NoteRow = typeof notes.$inferSelect;
type ShareRow = typeof noteShares.$inferSelect;
type Person = { id: string; name: string; email: string };

async function names(db: Database, ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const rows = await db.execute<Person>(sql`
    SELECT u.id, u.email, coalesce(u.full_name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name
    FROM users u WHERE u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Map(rows.rows.map((r) => [r.id, r]));
}

export function notesRouter(db: Database, env: Env) {
  const router = Router();
  const key = () => vaultKey(env);

  const staffOnly = (role: string) => {
    if (role === "candidate") throw new ForbiddenError("Notes are for staff");
  };

  /** What the caller may do with a note: owner, shared editor, shared viewer, or nothing. */
  async function access(note: NoteRow, userId: string): Promise<"owner" | "edit" | "view" | null> {
    if (note.ownerId === userId) return "owner";
    const share = await db.query.noteShares.findFirst({ where: and(eq(noteShares.noteId, note.id), eq(noteShares.userId, userId)) });
    return share ? (share.canEdit ? "edit" : "view") : null;
  }

  async function load(id: string, userId: string) {
    const note = await db.query.notes.findFirst({ where: eq(notes.id, id) });
    if (!note) throw new NotFoundError("Note not found");
    const level = await access(note, userId);
    if (!level) throw new NotFoundError("Note not found"); // don't confirm it exists
    return { note, level };
  }

  async function shape(rows: NoteRow[], viewerId: string) {
    const ids = rows.map((n) => n.id);
    const shares: ShareRow[] = ids.length ? await db.select().from(noteShares).where(inArray(noteShares.noteId, ids)) : [];
    const who = await names(db, [...new Set([...rows.map((n) => n.ownerId), ...shares.map((s) => s.userId)])]);
    return rows.map((n) => {
      const mine = n.ownerId === viewerId;
      const myShare = shares.find((s) => s.noteId === n.id && s.userId === viewerId);
      return {
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        url: n.url,
        username: n.username,
        hasSecret: !!n.secretCiphertext,
        important: n.important,
        tags: n.tags,
        projectId: n.projectId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        owner: { id: n.ownerId, name: who.get(n.ownerId)?.name ?? "Someone" },
        access: mine ? "owner" : myShare?.canEdit ? "edit" : "view",
        // Only the owner sees the whole share list.
        sharedWith: mine ? shares.filter((s) => s.noteId === n.id).map((s) => ({ id: s.userId, name: who.get(s.userId)?.name ?? "Someone", canEdit: s.canEdit })) : [],
        sharedCount: shares.filter((s) => s.noteId === n.id).length,
      };
    });
  }

  async function validShares(list: z.infer<typeof shareSchema>[] | undefined, ownerId: string) {
    if (!list) return undefined;
    const unique = new Map(list.filter((s) => s.userId !== ownerId).map((s) => [s.userId, s]));
    if (unique.size) {
      const found = await db.query.users.findMany({ where: inArray(users.id, [...unique.keys()]), columns: { id: true, role: true } });
      if (found.length !== unique.size || found.some((u) => u.role === "candidate")) throw new AppError("INVALID_SHARE", "Notes can be shared with staff only", 400);
    }
    return [...unique.values()];
  }

  async function replaceShares(noteId: string, ownerId: string, list: z.infer<typeof shareSchema>[], actorId: string, title: string) {
    const before = await db.query.noteShares.findMany({ where: eq(noteShares.noteId, noteId) });
    await db.transaction(async (tx) => {
      await tx.delete(noteShares).where(eq(noteShares.noteId, noteId));
      if (list.length) await tx.insert(noteShares).values(list.map((s) => ({ noteId, userId: s.userId, canEdit: s.canEdit, sharedBy: actorId })));
    });
    const added = list.map((s) => s.userId).filter((id) => !before.some((b) => b.userId === id) && id !== ownerId);
    if (added.length) await notify(db, { userIds: added, actorUserId: actorId, kind: "note.shared", title: `Shared with you: ${title}`, link: `/notes?open=${noteId}` });
  }

  router.get("/", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const q = z.object({ projectId: z.string().uuid().optional() }).parse(req.query);
    const me = req.user!.sub;
    if (q.projectId && !(await canAccessProject(db, me, req.user!.role, q.projectId))) throw new ForbiddenError();
    const rows = await db.execute<{ id: string }>(sql`
      SELECT n.id FROM notes n
      WHERE (n.owner_id = ${me} OR EXISTS (SELECT 1 FROM note_shares s WHERE s.note_id = n.id AND s.user_id = ${me}))
        ${q.projectId ? sql`AND n.project_id = ${q.projectId}` : sql``}
      ORDER BY n.important DESC, n.updated_at DESC LIMIT 1000
    `);
    const ids = rows.rows.map((r) => r.id);
    const list = ids.length ? await db.query.notes.findMany({ where: inArray(notes.id, ids) }) : [];
    const order = new Map(ids.map((id, i) => [id, i]));
    list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    res.json({ notes: await shape(list, me), vaultKeyConfigured: !!env.PORTAL_VAULT_KEY });
  });

  router.post("/", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const body = noteSchema.parse(req.body);
    const me = req.user!.sub;
    if (body.kind === "secret" && !body.secret) throw new AppError("VALIDATION_ERROR", "Enter the password or secret to store", 400);
    if (body.kind === "bookmark" && !body.url) throw new AppError("VALIDATION_ERROR", "Add the link to bookmark", 400);
    if (body.projectId && !(await canAccessProject(db, me, req.user!.role, body.projectId))) throw new ForbiddenError();
    const shares = await validShares(body.shares, me);
    const [note] = await db
      .insert(notes)
      .values({
        ownerId: me,
        kind: body.kind,
        title: body.title,
        body: body.body ?? null,
        url: body.url ?? null,
        username: body.kind === "secret" ? body.username ?? null : null,
        secretCiphertext: body.kind === "secret" && body.secret ? encryptSecret(key(), body.secret) : null,
        important: body.important,
        tags: body.tags,
        projectId: body.projectId ?? null,
      })
      .returning();
    if (shares?.length) await replaceShares(note.id, me, shares, me, note.title);
    await writeAuditLog(db, { actorUserId: me, action: "note.create", entityType: "note", entityId: note.id, metadata: { kind: note.kind, shared: shares?.length ?? 0 }, ipAddress: req.ip });
    res.status(201).json({ note: (await shape([note], me))[0] });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const { note } = await load(req.params.id, req.user!.sub);
    res.json({ note: (await shape([note], req.user!.sub))[0] });
  });

  router.put("/:id", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const { note, level } = await load(req.params.id, req.user!.sub);
    if (level === "view") throw new ForbiddenError("This note was shared with you to read only");
    const body = noteSchema.parse(req.body);
    if (body.kind !== note.kind && level !== "owner") throw new ForbiddenError("Only the owner can change what kind of note this is");
    if (body.shares && level !== "owner") throw new ForbiddenError("Only the owner can change who it's shared with");
    if (body.projectId && body.projectId !== note.projectId && !(await canAccessProject(db, req.user!.sub, req.user!.role, body.projectId))) throw new ForbiddenError();
    if (body.kind === "secret" && !body.secret && !note.secretCiphertext) throw new AppError("VALIDATION_ERROR", "Enter the password or secret to store", 400);
    const shares = await validShares(body.shares, note.ownerId);
    const [updated] = await db
      .update(notes)
      .set({
        kind: body.kind,
        title: body.title,
        body: body.body ?? null,
        url: body.url ?? null,
        username: body.kind === "secret" ? body.username ?? null : null,
        secretCiphertext: body.kind !== "secret" ? null : body.secret ? encryptSecret(key(), body.secret) : note.secretCiphertext,
        important: body.important,
        tags: body.tags,
        projectId: body.projectId === undefined ? note.projectId : body.projectId,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, note.id))
      .returning();
    if (shares) await replaceShares(note.id, note.ownerId, shares, req.user!.sub, updated.title);
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "note.update", entityType: "note", entityId: note.id, metadata: { secretChanged: !!body.secret }, ipAddress: req.ip });
    res.json({ note: (await shape([updated], req.user!.sub))[0] });
  });

  /** The decrypted secret, for the owner and the people it's shared with. Logged every time. */
  router.post("/:id/reveal", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const { note } = await load(req.params.id, req.user!.sub);
    if (!note.secretCiphertext) throw new AppError("NO_SECRET", "This note has no stored secret", 400);
    let secret: string;
    try {
      secret = decryptSecret(key(), note.secretCiphertext);
    } catch {
      throw new AppError("SECRET_UNREADABLE", "This secret can't be decrypted. The vault key may have changed since it was saved.", 500);
    }
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "note.secret_reveal", entityType: "note", entityId: note.id, ipAddress: req.ip });
    res.setHeader("Cache-Control", "no-store");
    res.json({ secret });
  });

  /** Leave a note someone shared with you. */
  router.delete("/:id/share", requireAuth(env), async (req, res) => {
    await db.delete(noteShares).where(and(eq(noteShares.noteId, req.params.id), eq(noteShares.userId, req.user!.sub)));
    res.status(204).end();
  });

  router.delete("/:id", requireAuth(env), async (req, res) => {
    staffOnly(req.user!.role);
    const { note, level } = await load(req.params.id, req.user!.sub);
    if (level !== "owner") throw new ForbiddenError("Only the owner can delete this note");
    await db.delete(notes).where(eq(notes.id, note.id));
    await writeAuditLog(db, { actorUserId: req.user!.sub, action: "note.delete", entityType: "note", entityId: note.id, ipAddress: req.ip });
    res.status(204).end();
  });

  return router;
}
