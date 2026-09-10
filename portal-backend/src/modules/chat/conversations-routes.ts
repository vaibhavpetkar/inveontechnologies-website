import { Router } from "express";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { privateConversations, conversationParticipants } from "../shared/db/schema.js";
import { requireAuth } from "../auth/middleware.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import type { Env } from "../shared/env.js";

const startSchema = z.object({ participantIds: z.array(z.string().uuid()).min(1).max(20) });

export async function isConversationParticipant(db: Database, conversationId: string, userId: string): Promise<boolean> {
  const row = await db.query.conversationParticipants.findFirst({ where: (p, { and, eq }) => and(eq(p.conversationId, conversationId), eq(p.userId, userId)) });
  return !!row;
}

export function conversationsRouter(db: Database, env: Env) {
  const router = Router();

  // Finds an existing conversation with exactly this set of participants
  // (including the caller), or creates a new one. Keeps DMs 1:1 or small
  // groups without duplicating threads every time two people message again.
  router.post("/", requireAuth(env), async (req, res) => {
    const body = startSchema.parse(req.body);
    const allParticipantIds = Array.from(new Set([req.user!.sub, ...body.participantIds])).sort();

    const myConversations = await db.query.conversationParticipants.findMany({ where: eq(conversationParticipants.userId, req.user!.sub) });
    for (const candidate of myConversations) {
      const participants = await db.query.conversationParticipants.findMany({ where: eq(conversationParticipants.conversationId, candidate.conversationId) });
      const ids = participants.map((p) => p.userId).sort();
      if (ids.length === allParticipantIds.length && ids.every((id, i) => id === allParticipantIds[i])) {
        res.json({ conversation: { id: candidate.conversationId }, existing: true });
        return;
      }
    }

    const [conversation] = await db.insert(privateConversations).values({}).returning();
    await db.insert(conversationParticipants).values(allParticipantIds.map((userId) => ({ conversationId: conversation.id, userId })));
    res.status(201).json({ conversation, existing: false });
  });

  router.get("/", requireAuth(env), async (req, res) => {
    const mine = await db.query.conversationParticipants.findMany({ where: eq(conversationParticipants.userId, req.user!.sub) });
    const conversationIds = mine.map((m) => m.conversationId);
    const conversations = conversationIds.length ? await db.query.privateConversations.findMany({ where: inArray(privateConversations.id, conversationIds) }) : [];
    res.json({ conversations });
  });

  router.get("/:id", requireAuth(env), async (req, res) => {
    if (!(await isConversationParticipant(db, req.params.id, req.user!.sub))) throw new ForbiddenError();
    const conversation = await db.query.privateConversations.findFirst({ where: eq(privateConversations.id, req.params.id) });
    if (!conversation) throw new NotFoundError("Conversation not found");
    const participants = await db.query.conversationParticipants.findMany({ where: eq(conversationParticipants.conversationId, conversation.id) });
    res.json({ conversation, participants });
  });

  return router;
}
