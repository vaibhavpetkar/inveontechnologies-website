import { eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import { applications, opportunities } from "../shared/db/schema.js";
import { notify } from "./service.js";

// What a candidate is told when their application moves. Statuses missing
// here (submitted, withdrawn) are the candidate's own actions.
const STATUS_MESSAGES: Record<string, { title: string; body: string; email: boolean }> = {
  under_review: { title: "Your application is being reviewed", body: "The hiring team has started reviewing your application for {opp}.", email: false },
  shortlisted: { title: "You've been shortlisted", body: "Good news: you've been shortlisted for {opp}. The team will be in touch about next steps.", email: true },
  selected: { title: "You've been selected", body: "Congratulations! You've been selected for {opp}. Watch for your offer in the portal.", email: true },
  rejected: { title: "Update on your application", body: "Thank you for applying to {opp}. The team has decided not to move forward this time.", email: true },
  assessment_completed: { title: "Assessment received", body: "Your assessment for {opp} has been recorded.", email: false },
};

async function applicationContext(db: Database, applicationId: string) {
  const application = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
  if (!application) return null;
  const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, application.opportunityId), columns: { title: true } });
  return { application, opportunityTitle: opportunity?.title ?? "the opening" };
}

export async function notifyApplicationStatus(db: Database, applicationId: string, toStatus: string, actorUserId: string | null) {
  const message = STATUS_MESSAGES[toStatus];
  if (!message) return;
  const ctx = await applicationContext(db, applicationId);
  if (!ctx) return;
  await notify(db, {
    userIds: [ctx.application.userId],
    actorUserId,
    kind: `application.${toStatus}`,
    title: message.title,
    body: message.body.replace("{opp}", ctx.opportunityTitle),
    link: "/candidate",
    email: message.email,
  });
}

export async function notifyCandidate(db: Database, applicationId: string, input: { kind: string; title: string; body: (opportunityTitle: string) => string; link?: string; email?: boolean; actorUserId?: string }) {
  const ctx = await applicationContext(db, applicationId);
  if (!ctx) return;
  await notify(db, {
    userIds: [ctx.application.userId],
    actorUserId: input.actorUserId,
    kind: input.kind,
    title: input.title,
    body: input.body(ctx.opportunityTitle),
    link: input.link ?? "/candidate",
    email: input.email,
  });
}
