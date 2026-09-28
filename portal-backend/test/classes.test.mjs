import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";

let api, hr, admin, course;

before(async () => {
  api = await startServer();
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
  course = (await api.call("POST", "/courses", { token: hr.token, body: { title: `React live ${Date.now()}`, description: "Components, hooks and state, taught live." } })).json.course;
  await api.call("POST", `/courses/${course.id}/publish`, { token: admin.token });
});
after(async () => {
  await api?.stop();
});

const inDays = (d, hour = 10) => {
  const t = new Date(Date.now() + d * 86_400_000);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
};
const kinds = async (userId) => (await api.pool.query("SELECT kind FROM notifications WHERE user_id = $1", [userId])).rows.map((r) => r.kind);
const invites = async (email) => (await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [email])).rows.map((r) => r.payload);

async function enroll(user) {
  const r = await api.call("POST", `/courses/${course.id}/enroll`, { token: user.token, body: {} });
  assert.equal(r.status, 201, JSON.stringify(r.json));
}

describe("live classes", () => {
  test("scheduling a weekly class invites everyone learning the course; later learners join the upcoming ones", async () => {
    const early = await api.createUser("intern");
    await enroll(early);

    const r = await api.call("POST", `/courses/${course.id}/classes`, {
      token: hr.token,
      body: { startsAt: inDays(2, 10), endsAt: inDays(2, 11), provider: "manual", joinUrl: "https://meet.example.com/react", weeks: 3 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.classes.length, 3);
    assert.equal(r.json.invited, 1);
    const [first, second] = r.json.classes;
    assert.equal(first.kind, "class");
    assert.equal(first.course.id, course.id);
    assert.ok(first.seriesId && first.seriesId === second.seriesId);
    assert.equal(new Date(second.startsAt) - new Date(first.startsAt), 7 * 86_400_000);
    assert.ok(first.attendees.some((a) => a.id === early.id));
    assert.ok((await kinds(early.id)).includes("class.invited"));
    const mail = await invites(early.email);
    assert.equal(mail.filter((m) => m.icalEvent?.method === "REQUEST").length, 3);
    assert.match(mail[0].text, /live class/);

    // It shows on the learner's calendar as a class.
    const cal = await api.call("GET", `/calendar/events?from=${encodeURIComponent(inDays(0, 0))}&to=${encodeURIComponent(inDays(30, 0))}`, { token: early.token });
    assert.equal(cal.json.events.filter((e) => e.kind === "class" && e.course?.id === course.id).length, 3);

    // Someone who enrolls afterwards is added to all three.
    const late = await api.createUser("intern");
    await enroll(late);
    const theirs = await api.call("GET", `/courses/${course.id}/classes`, { token: late.token });
    assert.equal(theirs.json.classes.length, 3);
    assert.ok(theirs.json.classes.every((c) => c.attendees.some((a) => a.id === late.id)));
    assert.equal(theirs.json.canSchedule, false);

    // Not enrolled: nothing to see, can't schedule.
    const outsider = await api.createUser("intern");
    assert.deepEqual((await api.call("GET", `/courses/${course.id}/classes`, { token: outsider.token })).json.classes, []);
    assert.equal((await api.call("POST", `/courses/${course.id}/classes`, { token: outsider.token, body: { startsAt: inDays(3), endsAt: inDays(3, 11) } })).status, 403);

    // Cancel the rest of the series.
    const stranger = await api.createUser("manager");
    assert.equal((await api.call("POST", `/courses/classes/series/${first.seriesId}/cancel`, { token: stranger.token })).status, 403);
    const cancel = await api.call("POST", `/courses/classes/series/${first.seriesId}/cancel`, { token: hr.token });
    assert.equal(cancel.json.cancelled, 3);
    assert.equal((await api.call("GET", `/courses/${course.id}/classes`, { token: late.token })).json.classes.length, 0);
    assert.ok((await kinds(late.id)).includes("class.cancelled"));
  });

  test("a single class uses a default title and checks its times", async () => {
    const bad = await api.call("POST", `/courses/${course.id}/classes`, { token: hr.token, body: { startsAt: inDays(1, 11), endsAt: inDays(1, 10) } });
    assert.equal(bad.status, 400);
    const past = await api.call("POST", `/courses/${course.id}/classes`, { token: hr.token, body: { startsAt: inDays(-3, 10), endsAt: inDays(-3, 11) } });
    assert.equal(past.status, 400);
    const ok = await api.call("POST", `/courses/${course.id}/classes`, { token: hr.token, body: { startsAt: inDays(1, 10), endsAt: inDays(1, 11), location: "Pune office" } });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.classes[0].title, `${course.title}: live class`);
    assert.equal(ok.json.classes[0].seriesId, null);
  });
});
