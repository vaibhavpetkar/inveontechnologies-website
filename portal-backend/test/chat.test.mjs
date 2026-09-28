import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, admin;
before(async () => {
  api = await startServer();
  admin = await api.createUser("admin");
});
after(async () => api?.stop());

const inbox = async (u) => (await api.call("GET", "/chat/inbox", { token: u.token })).json.threads;
const send = (u, target, body, mentionedUserIds = []) => api.call("POST", "/messages", { token: u.token, body: { ...target, body, mentionedUserIds } });
const notes = async (u, kind) => (await api.pool.query("SELECT title, body, link FROM notifications WHERE user_id = $1 AND kind = $2 ORDER BY created_at", [u.id, kind])).rows;

describe("chat inbox", () => {
  test("everyone lands in the community's #general and #announcements; plain candidates can't chat", async () => {
    const e = await api.createUser("employee");
    const threads = await inbox(e);
    const names = threads.filter((t) => t.kind === "channel").map((t) => t.title).sort();
    assert.deepEqual(names, ["announcements", "general"]);
    assert.equal(threads.find((t) => t.title === "announcements").channelType, "announcement");

    const c = await api.createUser("candidate");
    assert.equal((await api.call("GET", "/chat/inbox", { token: c.token })).status, 403);
    assert.equal((await api.call("POST", "/chat/dm", { token: e.token, body: { userId: c.id } })).status, 400, "can't DM someone outside chat");
    const people = (await api.call("GET", "/chat/people", { token: e.token })).json.people;
    assert.ok(people.some((p) => p.id === e.id));
    assert.ok(!people.some((p) => p.id === c.id));
  });

  test("a candidate on a program trial can chat", async () => {
    const c = await api.createUser("candidate");
    const opp = (await api.call("POST", "/opportunities", { token: admin.token, body: { title: "Chat program", description: "A program with chat access" } })).json.opportunity;
    await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
    const app = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: c.token, body: {} })).json.application;
    assert.equal((await api.call("GET", "/chat/inbox", { token: c.token })).status, 403);
    await api.pool.query("INSERT INTO program_enrollments (application_id, user_id, opportunity_id, status) VALUES ($1, $2, $3, 'trial')", [app.id, c.id, opp.id]);
    assert.equal((await api.call("GET", "/chat/inbox", { token: c.token })).status, 200);
  });

  test("DMs are reused, show the last message and unread count, and reading clears it", async () => {
    const a = await api.createUser("employee");
    const b = await api.createUser("intern");
    const first = await api.call("POST", "/chat/dm", { token: a.token, body: { userId: b.id } });
    assert.equal(first.status, 201);
    const again = await api.call("POST", "/chat/dm", { token: b.token, body: { userId: a.id } });
    assert.equal(again.json.conversation.id, first.json.conversation.id);

    const target = { conversationId: first.json.conversation.id };
    await send(a, target, "hey there");
    const m2 = (await send(a, target, "are you free at 4?")).json.message;
    const dm = (await inbox(b)).find((t) => t.id === target.conversationId);
    assert.equal(dm.kind, "dm");
    assert.equal(dm.unread, 2);
    assert.equal(dm.last.body, "are you free at 4?");
    assert.equal(dm.members.length, 2);
    assert.equal((await inbox(a)).find((t) => t.id === target.conversationId).unread, 0, "your own messages aren't unread");

    await api.call("POST", "/messages/read-state", { token: b.token, body: { ...target, lastReadSeq: m2.seqNumber } });
    assert.equal((await inbox(b)).find((t) => t.id === target.conversationId).unread, 0);

    const alerts = await notes(b, "chat.message");
    assert.equal(alerts.length, 1, "one alert per chat per ten minutes");
    assert.match(alerts[0].link, new RegExp(`/chat/dm/${target.conversationId}$`));
  });

  test("group chats: admins rename and add, anyone leaves, admin passes on", async () => {
    const owner = await api.createUser("employee");
    const x = await api.createUser("employee");
    const y = await api.createUser("intern");
    const z = await api.createUser("employee");
    const created = await api.call("POST", "/chat/groups", { token: owner.token, body: { title: "Frontend squad", memberIds: [x.id, y.id] } });
    assert.equal(created.status, 201);
    const id = created.json.group.id;

    const info = (await api.call("GET", `/chat/threads/group/${id}`, { token: x.token })).json;
    assert.equal(info.title, "Frontend squad");
    assert.equal(info.members.length, 3);
    assert.equal(info.canManage, false);
    assert.equal((await api.call("PATCH", `/chat/groups/${id}`, { token: x.token, body: { title: "Mine now" } })).status, 403);
    assert.equal((await api.call("PATCH", `/chat/groups/${id}`, { token: owner.token, body: { title: "Frontend crew" } })).status, 200);
    assert.equal((await api.call("POST", `/chat/groups/${id}/members`, { token: owner.token, body: { userIds: [z.id] } })).status, 200);
    assert.equal((await api.call("GET", `/chat/threads/group/${id}`, { token: z.token })).status, 200);

    // A DM between the same people is still its own chat.
    const legacy = await api.call("POST", "/conversations", { token: owner.token, body: { participantIds: [x.id, y.id, z.id] } });
    assert.notEqual(legacy.json.conversation.id, id);

    assert.equal((await api.call("DELETE", `/chat/groups/${id}/members/${owner.id}`, { token: owner.token })).status, 200);
    const after = (await api.call("GET", `/chat/threads/group/${id}`, { token: x.token })).json;
    assert.equal(after.members.length, 3);
    assert.equal(after.members.filter((m) => m.is_admin).length, 1, "someone else became admin");
    assert.equal((await api.call("GET", `/chat/threads/group/${id}`, { token: owner.token })).status, 403);
  });

  test("@mentions alert only people who can open the chat", async () => {
    const a = await api.createUser("employee");
    const inGroup = await api.createUser("employee");
    const outsider = await api.createUser("employee");
    const id = (await api.call("POST", "/chat/groups", { token: a.token, body: { title: "Release", memberIds: [inGroup.id] } })).json.group.id;
    const r = await send(a, { conversationId: id }, "@someone can you check the build?", [inGroup.id, outsider.id]);
    assert.equal(r.status, 201);
    const mention = await notes(inGroup, "chat.mention");
    assert.equal(mention.length, 1);
    assert.match(mention[0].title, /mentioned you in Release/);
    assert.equal((await notes(outsider, "chat.mention")).length, 0);
    assert.equal((await notes(inGroup, "chat.message")).length, 0, "a mention replaces the plain message alert");
    const thread = (await inbox(inGroup)).find((t) => t.id === id);
    assert.equal(thread.mentions, 1);
  });

  test("only moderators post in #announcements", async () => {
    const e = await api.createUser("employee");
    const threads = await inbox(e);
    const ann = threads.find((t) => t.title === "announcements");
    assert.equal((await send(e, { channelId: ann.id }, "hello all")).status, 403);
    await inbox(admin);
    assert.equal((await send(admin, { channelId: ann.id }, "Welcome to the portal")).status, 201);
    const view = (await api.call("GET", `/chat/threads/channel/${ann.id}`, { token: e.token })).json;
    assert.equal(view.canPost, false);
  });
});
