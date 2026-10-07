// Hiring and team workspace: subject interviews, candidate documents, direct
// hire with the join letter, project roadmaps, task kickoffs, the team board
// and notes with encrypted shared passwords.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, createOpportunityWithApplication } from "./helpers.mjs";
import { encryptSecret, decryptSecret, vaultKey } from "../dist/modules/notes/crypto.js";
import { freeSlots, istDayStart } from "../dist/modules/team/routes.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
let api, hr, admin, uploadDir;

before(async () => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "portal-uploads-"));
  api = await startServer({ PORTAL_UPLOAD_DIR: uploadDir, PORTAL_VAULT_KEY: "test-vault-key-".padEnd(40, "v") });
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
});
after(async () => {
  await api?.stop();
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

async function upload(user, name = "doc.pdf") {
  const res = await fetch(`${api.base}/files?purpose=application_document&name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/octet-stream" },
    body: PDF,
  });
  return (await res.json()).file;
}

describe("interviews and exams for a subject", () => {
  test("a round keeps its subject, kind and length, and shows on both calendars", async () => {
    const { candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    const at = new Date(Date.now() + 2 * 86400000);
    const r = await api.call("POST", `/applications/${application.id}/interviews`, {
      token: hr.token,
      body: { interviewerId: hr.id, scheduledAt: at.toISOString(), subject: "Java", kind: "exam", durationMinutes: 90, meetingUrl: "https://meet.google.com/aaa-bbbb-ccc" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.interview.subject, "Java");
    assert.equal(r.json.interview.kind, "exam");
    assert.equal(r.json.interview.durationMinutes, 90);

    const from = new Date(at.getTime() - 3600_000).toISOString();
    const to = new Date(at.getTime() + 3 * 3600_000).toISOString();
    const mine = (await api.call("GET", `/calendar/events?from=${from}&to=${to}`, { token: candidate.token })).json.events.find((e) => e.id === `interview:${r.json.interview.id}`);
    assert.ok(mine, "on the candidate's calendar");
    assert.match(mine.title, /Java exam/);
    assert.equal(new Date(mine.endsAt) - new Date(mine.startsAt), 90 * 60000);
    const theirs = (await api.call("GET", `/calendar/events?from=${from}&to=${to}`, { token: hr.token })).json.events.find((e) => e.id === `interview:${r.json.interview.id}`);
    assert.match(theirs.title, /^Java:/);

    // A subject exam passing is one step, not the HR round: no program fee step yet.
    const fb = await api.call("POST", `/interviews/${r.json.interview.id}/feedback`, { token: hr.token, body: { feedback: "82%", decision: "pass" } });
    assert.equal(fb.status, 200);
    assert.equal(fb.json.enrollment, null);
  });

  test("asking for Google Meet when it isn't set up says so", async () => {
    const { application } = await createOpportunityWithApplication(api, { hr, admin });
    const r = await api.call("POST", `/applications/${application.id}/interviews`, { token: hr.token, body: { interviewerId: hr.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), provider: "google_meet" } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, "PROVIDER_NOT_CONFIGURED");
  });
});

describe("candidate documents", () => {
  test("a candidate sends a document unasked, HR sees it in the queue and accepts it", async () => {
    const { candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    const mine = await api.call("GET", "/me/documents", { token: candidate.token });
    assert.equal(mine.status, 200);
    assert.ok(mine.json.applications.some((a) => a.id === application.id), "they can attach to their application");

    const file = await upload(candidate, "degree.pdf");
    const sent = await api.call("POST", "/me/documents", { token: candidate.token, body: { applicationId: application.id, documentName: "Degree certificate", fileUrl: file.url } });
    assert.equal(sent.status, 201, JSON.stringify(sent.json));
    assert.equal(sent.json.documentRequest.status, "uploaded");

    const queue = await api.call("GET", "/documents/queue", { token: hr.token });
    const row = queue.json.documents.find((d) => d.id === sent.json.documentRequest.id);
    assert.ok(row, "in HR's queue");
    assert.equal(row.candidate.id, candidate.id);
    assert.ok(queue.json.counts.uploaded >= 1);

    assert.equal((await api.call("POST", `/documents/${row.id}/verify`, { token: hr.token, body: { approve: true } })).status, 200);
    const after = (await api.call("GET", "/me/documents", { token: candidate.token })).json.documents.find((d) => d.id === row.id);
    assert.equal(after.status, "verified");
  });

  test("nobody else can send documents on someone's application; candidates can't see the queue", async () => {
    const { candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    const other = await api.createUser("candidate");
    const file = await upload(other);
    assert.equal((await api.call("POST", "/me/documents", { token: other.token, body: { applicationId: application.id, documentName: "PAN", fileUrl: file.url } })).status, 403);
    assert.equal((await api.call("GET", "/documents/queue", { token: candidate.token })).status, 403);
  });
});

describe("hire directly", () => {
  test("defaults come from the opening and the profile; hiring makes them an intern and selects the application", async () => {
    const { candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    const d = await api.call("GET", `/applications/${application.id}/hire-defaults`, { token: hr.token });
    assert.equal(d.status, 200);
    assert.equal(d.json.candidate.name, "Test candidate");
    assert.equal(d.json.candidate.phone, "9000000000");
    assert.equal(d.json.canIssueLetter, false);
    assert.ok(d.json.defaults.joiningDate);

    const hired = await api.call("POST", `/applications/${application.id}/hire`, {
      token: hr.token,
      body: { employeeType: "intern", joiningDate: d.json.defaults.joiningDate, durationMonths: 3, designationTitle: "Frontend Intern", monthlyPay: 5000, sendLetter: true },
    });
    assert.equal(hired.status, 201, JSON.stringify(hired.json));
    assert.equal(hired.json.letterIssued, false, "HR can't issue letters");
    assert.equal(hired.json.letterRequested, true, "admins are asked to");
    const role = (await api.pool.query("SELECT role FROM users WHERE id = $1", [candidate.id])).rows[0].role;
    assert.equal(role, "intern");
    assert.equal((await api.pool.query("SELECT status FROM applications WHERE id = $1", [application.id])).rows[0].status, "selected");
    const asked = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'letter.to_issue'", [admin.id]);
    assert.ok(asked.rows[0].n >= 1);

    const again = await api.call("POST", `/applications/${application.id}/hire`, { token: hr.token, body: { employeeType: "intern", joiningDate: "2026-11-01" } });
    assert.equal(again.status, 409);
  });

  test("an admin hire emails the join letter built from the joining terms", async () => {
    const terms = (await api.call("GET", "/settings/joining-terms", { token: admin.token })).json.terms;
    const custom = { ...terms, signatoryName: "Asha Rao", signatoryTitle: "Head of People", full_time: { ...terms.full_time, noticeDays: 45, additionalTerms: "Laptop provided by the company." } };
    assert.equal((await api.call("PUT", "/settings/joining-terms", { token: admin.token, body: custom })).status, 200);
    assert.equal((await api.call("PUT", "/settings/joining-terms", { token: hr.token, body: custom })).status, 403, "only admins change the terms");

    const { candidate, application } = await createOpportunityWithApplication(api, { hr, admin });
    const hired = await api.call("POST", `/applications/${application.id}/hire`, { token: admin.token, body: { employeeType: "full_time", joiningDate: "2026-11-02", designationTitle: "Backend Developer", monthlyPay: 40000 } });
    assert.equal(hired.status, 201, JSON.stringify(hired.json));
    assert.equal(hired.json.letterIssued, true);
    const letter = (await api.pool.query("SELECT details, signatory_name FROM employee_letters WHERE employee_id = $1", [hired.json.employee.id])).rows[0];
    assert.equal(letter.signatory_name, "Asha Rao");
    assert.equal(letter.details.noticeDays, 45);
    assert.equal(letter.details.additionalTerms, "Laptop provided by the company.");
    assert.equal(letter.details.designation, "Backend Developer");
    const queued = await api.pool.query("SELECT count(*)::int AS n FROM jobs WHERE type = 'letter.email' AND payload->>'to' = $1", [candidate.email]);
    assert.equal(queued.rows[0].n, 1);
  });

  test("closed applications can't be hired from", async () => {
    const { application } = await createOpportunityWithApplication(api, { hr, admin });
    await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "rejected" } });
    assert.equal((await api.call("POST", `/applications/${application.id}/hire`, { token: hr.token, body: { joiningDate: "2026-11-01" } })).status, 409);
  });
});

describe("projects, roadmap and task kickoff", () => {
  test("a project with members, a roadmap phase and a task started with a plan", async () => {
    const manager = await api.createUser("manager");
    const dev = await api.createUser("employee");
    const outsider = await api.createUser("employee");
    const p = await api.call("POST", "/projects", { token: manager.token, body: { title: "Rail booking app", description: "IRCTC-style booking", memberIds: [dev.id], githubRepo: "inveon/rail-app" } });
    assert.equal(p.status, 201, JSON.stringify(p.json));
    const projectId = p.json.project.id;
    assert.equal(p.json.project.githubRepo, "inveon/rail-app");

    const m = await api.call("POST", `/projects/${projectId}/milestones`, { token: manager.token, body: { title: "Phase 1: search and booking", startDate: new Date().toISOString(), dueDate: new Date(Date.now() + 14 * 86400000).toISOString() } });
    assert.equal(m.status, 201);
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { projectId, title: "Seat map screen", assigneeId: dev.id, milestoneId: m.json.milestone.id } })).json.task;
    assert.equal(task.milestoneId, m.json.milestone.id);

    // A phase from another project is refused.
    const other = (await api.call("POST", "/projects", { token: manager.token, body: { title: "Other project" } })).json.project;
    const otherPhase = (await api.call("POST", `/projects/${other.id}/milestones`, { token: manager.token, body: { title: "Elsewhere" } })).json.milestone;
    assert.equal((await api.call("PUT", `/tasks/${task.id}`, { token: manager.token, body: { milestoneId: otherPhase.id } })).status, 400);

    const start = await api.call("POST", `/tasks/${task.id}/transition`, {
      token: dev.token,
      body: { toStatus: "in_progress", kickoff: { plan: "Build the seat grid with React, then wire availability", expectedFinishAt: new Date(Date.now() + 3 * 86400000).toISOString(), branchOrLink: "feature/seat-map" } },
    });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    const upd = await api.call("POST", `/tasks/${task.id}/updates`, { token: dev.token, body: { kind: "progress", body: "Grid renders, availability next", progressPercent: 40 } });
    assert.equal(upd.status, 201);
    const updates = (await api.call("GET", `/tasks/${task.id}/updates`, { token: manager.token })).json.updates;
    assert.deepEqual(updates.map((u) => u.kind), ["progress", "start"]);
    assert.equal(updates[1].branchOrLink, "feature/seat-map");
    assert.equal((await api.call("POST", `/tasks/${task.id}/updates`, { token: outsider.token, body: { body: "hi there" } })).status, 403);

    const overview = await api.call("GET", `/projects/${projectId}/overview`, { token: dev.token });
    assert.equal(overview.status, 200);
    assert.equal(overview.json.canManage, false);
    assert.equal(overview.json.members.length, 2);
    assert.equal(overview.json.milestones[0].progress.total, 1);
    const t = overview.json.tasks[0];
    assert.equal(t.progressPercent, 40);
    assert.ok(t.startedAt && t.expectedFinishAt);
    assert.equal((await api.call("GET", `/projects/${projectId}/overview`, { token: outsider.token })).status, 403);

    const list = (await api.call("GET", "/projects", { token: dev.token })).json.projects;
    const mine = list.find((x) => x.id === projectId);
    assert.equal(mine.progress.total, 1);
    assert.equal(mine.nextMilestone.title, "Phase 1: search and booking");
    assert.ok(!list.some((x) => x.id === other.id), "only projects they're on");

    // The team board shows what they're on.
    const board = await api.call("GET", "/team/board", { token: outsider.token });
    assert.equal(board.status, 200);
    const devRow = board.json.people.find((x) => x.id === dev.id);
    assert.equal(devRow.working[0].title, "Seat map screen");
    assert.equal(devRow.working[0].progress, 40);
  });

  test("the team board shows who's in a meeting and lists the week's meetings", async () => {
    const a = await api.createUser("employee");
    const b = await api.createUser("employee");
    const startsAt = new Date(Date.now() - 10 * 60000);
    const ev = await api.call("POST", "/calendar/events", { token: a.token, body: { title: "Sprint planning", startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 60 * 60000).toISOString(), attendeeIds: [b.id], provider: "manual", joinUrl: "https://meet.google.com/abc-defg-hij" } });
    assert.equal(ev.status, 201, JSON.stringify(ev.json));
    const viewer = await api.createUser("employee");
    const board = (await api.call("GET", "/team/board", { token: viewer.token })).json;
    const row = board.people.find((x) => x.id === b.id);
    assert.equal(row.status, "in_meeting");
    assert.equal(row.currentMeeting.title, "Sprint planning");
    const meeting = board.meetings.find((m) => m.id === ev.json.event.id);
    assert.deepEqual(meeting.participants.map((p) => p.id).sort(), [a.id, b.id].sort());
    assert.equal(meeting.joinUrl, null, "the link is only for the people in it");
    assert.equal((await api.call("GET", "/team/board", { token: (await api.createUser("candidate")).token })).status, 403);
  });
});

describe("notes and shared passwords", () => {
  test("a secret is encrypted at rest, shared with one person, and revealed only to them", async () => {
    const owner = await api.createUser("employee");
    const friend = await api.createUser("employee");
    const stranger = await api.createUser("employee");
    const created = await api.call("POST", "/notes", { token: owner.token, body: { kind: "secret", title: "AWS console", username: "ops@inveon", url: "https://console.aws.amazon.com", secret: "s3cr3t-P@ss", important: true, shares: [{ userId: friend.id }] } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const id = created.json.note.id;
    assert.equal(created.json.note.hasSecret, true);
    assert.equal(JSON.stringify(created.json).includes("s3cr3t"), false, "never in the note itself");

    const raw = (await api.pool.query("SELECT secret_ciphertext FROM notes WHERE id = $1", [id])).rows[0].secret_ciphertext;
    assert.match(raw, /^v1\./);
    assert.equal(raw.includes("s3cr3t"), false);

    const list = (await api.call("GET", "/notes", { token: friend.token })).json.notes;
    const seen = list.find((n) => n.id === id);
    assert.equal(seen.access, "view");
    assert.deepEqual(seen.sharedWith, [], "only the owner sees the share list");
    assert.equal((await api.call("POST", `/notes/${id}/reveal`, { token: friend.token })).json.secret, "s3cr3t-P@ss");
    assert.equal((await api.call("PUT", `/notes/${id}`, { token: friend.token, body: { kind: "secret", title: "mine now" } })).status, 403);

    assert.equal((await api.call("GET", `/notes/${id}`, { token: stranger.token })).status, 404);
    assert.equal((await api.call("POST", `/notes/${id}/reveal`, { token: stranger.token })).status, 404);
    assert.ok(!(await api.call("GET", "/notes", { token: stranger.token })).json.notes.some((n) => n.id === id));

    const reveals = await api.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'note.secret_reveal' AND entity_id = $1", [id]);
    assert.equal(reveals.rows[0].n, 1);

    // Updating without a new secret keeps the stored one.
    assert.equal((await api.call("PUT", `/notes/${id}`, { token: owner.token, body: { kind: "secret", title: "AWS root", username: "ops@inveon", shares: [] } })).status, 200);
    assert.equal((await api.call("POST", `/notes/${id}/reveal`, { token: owner.token })).json.secret, "s3cr3t-P@ss");
    assert.equal((await api.call("POST", `/notes/${id}/reveal`, { token: friend.token })).status, 404, "unshared");
  });

  test("bookmarks need a link; candidates have no notes", async () => {
    const u = await api.createUser("employee");
    assert.equal((await api.call("POST", "/notes", { token: u.token, body: { kind: "bookmark", title: "Docs" } })).status, 400);
    assert.equal((await api.call("POST", "/notes", { token: u.token, body: { kind: "bookmark", title: "Docs", url: "https://react.dev" } })).status, 201);
    assert.equal((await api.call("GET", "/notes", { token: (await api.createUser("candidate")).token })).status, 403);
  });
});

describe("unit", () => {
  test("secrets round-trip and a tampered value is refused", () => {
    const key = vaultKey({ PORTAL_VAULT_KEY: "k".repeat(40), PORTAL_JWT_SECRET: "j".repeat(40) });
    const enc = encryptSecret(key, "hello");
    assert.notEqual(enc, encryptSecret(key, "hello"), "fresh IV each time");
    assert.equal(decryptSecret(key, enc), "hello");
    const parts = enc.split(".");
    parts[3] = Buffer.from("jello").toString("base64");
    assert.throws(() => decryptSecret(key, parts.join(".")));
    const other = vaultKey({ PORTAL_VAULT_KEY: "x".repeat(40), PORTAL_JWT_SECRET: "j".repeat(40) });
    assert.throws(() => decryptSecret(other, enc));
  });

  test("free slots skip meetings inside 10:00 to 19:00 IST", () => {
    const day = istDayStart(new Date("2026-10-07T06:00:00Z")); // 11:30 IST
    assert.equal(day.toISOString(), "2026-10-06T18:30:00.000Z");
    const at = (h, m = 0) => new Date(day.getTime() + (h * 60 + m) * 60000);
    const slots = freeSlots(day, [{ start: at(11), end: at(12), title: "a" }, { start: at(11, 30), end: at(13), title: "b" }, { start: at(18, 50), end: at(20), title: "c" }], at(9));
    assert.deepEqual(slots.map((s) => [s.start.toISOString(), s.end.toISOString()]), [
      [at(10).toISOString(), at(11).toISOString()],
      [at(13).toISOString(), at(18, 50).toISOString()],
    ]);
  });
});
