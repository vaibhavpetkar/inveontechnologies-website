import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, createOpportunityWithApplication } from "./helpers.mjs";

let api, hr, admin, dir;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

async function upload(user, purpose, name, bytes) {
  const res = await fetch(`${api.base}/files?purpose=${purpose}&name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  return { status: res.status, json: await res.json() };
}

async function download(user, url, query = "") {
  const res = await fetch(`${api.base}${url.replace("/api/v1", "")}${query}`, { headers: { Authorization: `Bearer ${user.token}` } });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "portal-uploads-"));
  api = await startServer({ PORTAL_UPLOAD_DIR: dir });
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
});
after(async () => {
  await api?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("file uploads", () => {
  test("checks type, content and size", async () => {
    const c = await api.createUser("candidate");
    assert.equal((await upload(c, "resume", "cv.exe", PDF)).json.error.code, "UNSUPPORTED_FILE_TYPE");
    assert.equal((await upload(c, "resume", "cv.png", PNG)).json.error.code, "UNSUPPORTED_FILE_TYPE", "resumes are documents only");
    assert.equal((await upload(c, "resume", "cv.pdf", Buffer.from("<html><script>alert(1)</script></html>"))).json.error.code, "FILE_CONTENT_MISMATCH");
    assert.equal((await upload(c, "resume", "cv.pdf", Buffer.alloc(0))).json.error.code, "EMPTY_FILE");
    const big = await upload(c, "resume", "cv.pdf", Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    assert.equal(big.status, 413);
    assert.equal((await upload(c, "not_a_purpose", "cv.pdf", PDF)).status, 400);

    const ok = await upload(c, "resume", "My CV.pdf", PDF);
    assert.equal(ok.status, 201);
    assert.equal(ok.json.file.name, "My CV.pdf");
    assert.equal(ok.json.file.mimeType, "application/pdf");
    assert.equal(ok.json.file.sizeBytes, PDF.length);
    assert.match(ok.json.file.url, /^\/api\/v1\/files\/[0-9a-f-]{36}$/);

    const res = await fetch(`${api.base}/files?purpose=resume&name=cv.pdf`, { method: "POST", body: PDF });
    assert.equal(res.status, 401, "sign-in required");
  });

  test("a resume is readable by its owner and staff on the application, nobody else", async () => {
    const { candidate } = await createOpportunityWithApplication(api, { hr, admin });
    const up = (await upload(candidate, "resume", "resume.pdf", PDF)).json.file;
    assert.equal((await api.call("PUT", "/profile/me/resume", { token: candidate.token, body: { fileUrl: up.url } })).status, 200);
    assert.equal((await api.call("GET", "/profile/me", { token: candidate.token })).json.resume.name, "resume.pdf");

    const mine = await download(candidate, up.url);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.bytes, PDF);
    assert.equal(mine.headers.get("x-content-type-options"), "nosniff");
    assert.match(mine.headers.get("content-disposition"), /^inline;/);
    assert.match((await download(candidate, up.url, "?download=1")).headers.get("content-disposition"), /^attachment;/);

    assert.equal((await download(hr, up.url)).status, 200);
    const other = await api.createUser("candidate");
    assert.equal((await download(other, up.url)).status, 403);
    const outsideManager = await api.createUser("manager");
    assert.equal((await download(outsideManager, up.url)).status, 403);

    // The applicant drawer sees it too.
    const [row] = (await api.pool.query("SELECT id FROM applications WHERE user_id = $1", [candidate.id])).rows;
    assert.equal((await api.call("GET", `/program/by-application/${row.id}`, { token: hr.token })).json.candidate.resume.url, up.url);

    // Someone else's upload can't be claimed.
    assert.equal((await api.call("PUT", "/profile/me/resume", { token: other.token, body: { fileUrl: up.url } })).json.error.code, "INVALID_FILE");
    assert.equal((await api.call("PUT", "/profile/me/resume", { token: candidate.token, body: { fileUrl: "https://evil.example/cv.pdf" } })).json.error.code, "INVALID_FILE");
    assert.equal((await api.call("GET", "/files/not-an-id", { token: candidate.token })).status, 404);
  });

  test("requested documents: candidate uploads, staff check, both are told", async () => {
    const { application, candidate } = await createOpportunityWithApplication(api, { hr, admin });
    const request = (await api.call("POST", `/applications/${application.id}/documents`, { token: hr.token, body: { documentName: "ID proof" } })).json.documentRequest;
    const alert = (await api.call("GET", "/notifications", { token: candidate.token })).json.notifications.find((n) => n.kind === "document.requested");
    assert.equal(alert.link, "/documents", "the candidate lands on My documents");

    const wrongPurpose = (await upload(candidate, "resume", "id.pdf", PDF)).json.file;
    assert.equal((await api.call("POST", `/documents/${request.id}/upload`, { token: candidate.token, body: { fileUrl: wrongPurpose.url } })).json.error.code, "INVALID_FILE");
    const file = (await upload(candidate, "application_document", "id.png", PNG)).json.file;
    assert.equal((await api.call("POST", `/documents/${request.id}/upload`, { token: candidate.token, body: { fileUrl: file.url } })).status, 200);
    assert.ok((await api.call("GET", "/notifications", { token: hr.token })).json.notifications.some((n) => n.kind === "document.uploaded"));

    assert.equal((await download(hr, file.url)).status, 200);
    assert.equal((await download(await api.createUser("candidate"), file.url)).status, 403);

    const shown = (await api.call("GET", `/program/by-application/${application.id}`, { token: candidate.token })).json.documents;
    assert.equal(shown[0].status, "uploaded");
    assert.equal((await api.call("POST", `/documents/${request.id}/verify`, { token: hr.token, body: { approve: false, note: "Blurry" } })).json.documentRequest.status, "rejected");
    assert.ok((await api.call("GET", "/notifications", { token: candidate.token })).json.notifications.some((n) => n.kind === "document.rejected"));
  });

  test("chat files go with the message and only chat members can open them", async () => {
    const a = await api.createUser("employee");
    const b = await api.createUser("intern");
    const c = await api.createUser("employee");
    const conversationId = (await api.call("POST", "/chat/dm", { token: a.token, body: { userId: b.id } })).json.conversation.id;
    const file = (await upload(a, "chat_attachment", "screenshot.png", PNG)).json.file;

    assert.equal((await api.call("POST", "/messages", { token: a.token, body: { conversationId, body: "" } })).json.error.code, "EMPTY_MESSAGE");
    assert.equal((await api.call("POST", "/messages", { token: b.token, body: { conversationId, fileUrls: [file.url] } })).json.error.code, "INVALID_FILE", "only your own uploads");
    const sent = await api.call("POST", "/messages", { token: a.token, body: { conversationId, fileUrls: [file.url] } });
    assert.equal(sent.status, 201);
    assert.equal(sent.json.message.attachments[0].name, "screenshot.png");

    const list = (await api.call("GET", `/messages?conversationId=${conversationId}`, { token: b.token })).json.messages;
    assert.equal(list.at(-1).attachments[0].url, file.url);
    assert.equal(list.at(-1).attachments[0].mimeType, "image/png");
    assert.equal((await api.call("GET", "/chat/inbox", { token: b.token })).json.threads.find((t) => t.id === conversationId).last.body, "Sent a file");

    assert.equal((await download(b, file.url)).status, 200);
    assert.equal((await download(c, file.url)).status, 403);
  });

  test("task attachments: anyone on the task can open them; the uploader can remove them", async () => {
    const manager = await api.createUser("manager");
    const intern = await api.createUser("intern");
    const outsider = await api.createUser("intern");
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Design the landing page", assigneeId: intern.id } })).json.task;
    const file = (await upload(intern, "task_attachment", "mockup.pdf", PDF)).json.file;

    const added = await api.call("POST", `/tasks/${task.id}/attachments`, { token: intern.token, body: { fileName: "mockup.pdf", fileUrl: file.url } });
    assert.equal(added.status, 201);
    assert.equal(added.json.attachment.file.sizeBytes, PDF.length);
    // Links to documents elsewhere still work.
    assert.equal((await api.call("POST", `/tasks/${task.id}/attachments`, { token: manager.token, body: { fileName: "Brief", fileUrl: "https://docs.example.com/brief" } })).status, 201);

    const listed = (await api.call("GET", `/tasks/${task.id}/attachments`, { token: manager.token })).json.attachments;
    assert.equal(listed.length, 2);
    assert.equal(listed.find((a) => a.file)?.file.name, "mockup.pdf");

    assert.equal((await download(manager, file.url)).status, 200);
    assert.equal((await download(outsider, file.url)).status, 403);

    const attachmentId = added.json.attachment.id;
    assert.equal((await api.call("DELETE", `/tasks/${task.id}/attachments/${attachmentId}`, { token: manager.token })).status, 403, "not the uploader");
    assert.equal((await api.call("DELETE", `/tasks/${task.id}/attachments/${attachmentId}`, { token: intern.token })).status, 204);
    assert.equal((await api.call("GET", `/tasks/${task.id}/attachments`, { token: manager.token })).json.attachments.length, 1);
  });
});
