// Calendar: meetings, invites (.ics), RSVPs, reminders and the Meet/Zoom adapters.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.mjs";
import { buildIcs } from "../dist/modules/calendar/ics.js";
import { googleMeetProvider, zoomProvider } from "../dist/modules/calendar/providers.js";

describe("ics", () => {
  const base = {
    uid: "abc@portal",
    sequence: 2,
    title: "Sprint review, team; all",
    description: "Line one\nLine two",
    url: "https://meet.google.com/abc-defg-hij",
    startsAt: new Date("2026-10-01T04:30:00Z"),
    endsAt: new Date("2026-10-01T05:00:00Z"),
    organizer: { name: "Priya Sharma", email: "priya@example.com" },
    attendees: [{ name: "Neha", email: "neha@example.com" }],
  };

  test("writes a REQUEST with escaped text, UTC times and folded lines", () => {
    const ics = buildIcs({ ...base, description: "x".repeat(200) }, new Date("2026-09-01T00:00:00Z"));
    assert.match(ics, /METHOD:REQUEST\r\n/);
    assert.match(ics, /DTSTART:20261001T043000Z\r\n/);
    assert.match(ics, /SUMMARY:Sprint review\\, team\\; all\r\n/);
    assert.match(ics, /SEQUENCE:2\r\n/);
    assert.match(ics.replace(/\r\n /g, ""), /ATTENDEE;CN=Neha;.*mailto:neha@example.com\r\n/); // unfolded
    for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  });

  test("a cancelled event is a CANCEL", () => {
    const ics = buildIcs({ ...base, cancelled: true });
    assert.match(ics, /METHOD:CANCEL/);
    assert.match(ics, /STATUS:CANCELLED/);
  });
});

describe("meeting providers", () => {
  const env = {
    PORTAL_GOOGLE_CLIENT_ID: "id",
    PORTAL_GOOGLE_CLIENT_SECRET: "secret",
    PORTAL_GOOGLE_REFRESH_TOKEN: "refresh",
    PORTAL_GOOGLE_CALENDAR_ID: "primary",
    PORTAL_ZOOM_ACCOUNT_ID: "acct",
    PORTAL_ZOOM_CLIENT_ID: "zid",
    PORTAL_ZOOM_CLIENT_SECRET: "zsecret",
    PORTAL_ZOOM_USER: "me",
  };
  const input = { title: "Standup", startsAt: new Date("2026-10-01T04:30:00Z"), endsAt: new Date("2026-10-01T05:00:00Z"), timezone: "Asia/Kolkata", attendeeEmails: ["a@example.com"] };
  const fakeFetch = (routes) => {
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url: String(url), init });
      const hit = routes.find(([re]) => re.test(String(url)));
      const [status, body] = hit ? hit[1] : [404, {}];
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    };
    return { impl, calls };
  };

  test("unconfigured providers say so", () => {
    assert.equal(googleMeetProvider({ PORTAL_GOOGLE_CALENDAR_ID: "primary" }).configured, false);
    assert.equal(zoomProvider({ PORTAL_ZOOM_USER: "me" }).configured, false);
  });

  test("Google Meet asks for a conference and returns the video link", async () => {
    const f = fakeFetch([
      [/oauth2\.googleapis\.com\/token/, [200, { access_token: "tok" }]],
      [/calendar\/v3\/calendars\/primary\/events/, [200, { id: "gev1", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz-abcd-efg" }] } }]],
    ]);
    const meet = googleMeetProvider(env, f.impl);
    assert.equal(meet.configured, true);
    const created = await meet.create(input);
    assert.deepEqual(created, { joinUrl: "https://meet.google.com/xyz-abcd-efg", externalId: "gev1" });
    const insert = f.calls[1];
    assert.match(insert.url, /conferenceDataVersion=1/);
    const body = JSON.parse(insert.init.body);
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
    assert.equal(insert.init.headers.Authorization, "Bearer tok");
  });

  test("Zoom uses account credentials and returns the join URL", async () => {
    const f = fakeFetch([
      [/zoom\.us\/oauth\/token/, [200, { access_token: "ztok" }]],
      [/api\.zoom\.us\/v2\/users\/me\/meetings/, [201, { id: 81234, join_url: "https://zoom.us/j/81234" }]],
    ]);
    const created = await zoomProvider(env, f.impl).create(input);
    assert.deepEqual(created, { joinUrl: "https://zoom.us/j/81234", externalId: "81234" });
    assert.match(f.calls[0].url, /grant_type=account_credentials&account_id=acct/);
    assert.equal(JSON.parse(f.calls[1].init.body).duration, 30);
  });

  test("a provider error becomes a readable 502", async () => {
    const f = fakeFetch([[/oauth2/, [401, { error: "invalid_grant" }]]]);
    await assert.rejects(googleMeetProvider(env, f.impl).create(input), (err) => err.status === 502 || err.statusCode === 502 || /failed \(401\)/.test(err.message));
  });
});

describe("calendar API", () => {
  let api, manager, emp, intern, outsider, candidate;
  const inbox = async (user) => (await api.call("GET", "/notifications", { token: user.token })).json.notifications;
  const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const range = () => `from=${encodeURIComponent(inHours(-24))}&to=${encodeURIComponent(inHours(24 * 20))}`;

  before(async () => {
    api = await startServer();
    manager = await api.createUser("manager", { profile: false });
    emp = await api.createUser("employee", { profile: false });
    intern = await api.createUser("intern", { profile: false });
    outsider = await api.createUser("employee", { profile: false });
    candidate = await api.createUser("candidate");
  });
  after(async () => api?.stop());

  test("creating a meeting invites attendees in the app and by email with an .ics", async () => {
    const res = await api.call("POST", "/calendar/events", {
      token: manager.token,
      body: { title: "Sprint planning", startsAt: inHours(48), endsAt: inHours(49), attendeeIds: [emp.id, intern.id], provider: "manual", joinUrl: "https://meet.google.com/abc-defg-hij" },
    });
    assert.equal(res.status, 201);
    const ev = res.json.event;
    assert.equal(ev.joinUrl, "https://meet.google.com/abc-defg-hij");
    assert.equal(ev.attendees.length, 3); // organiser + 2
    assert.equal(ev.myResponse, "accepted");

    const n = (await inbox(emp)).find((x) => x.kind === "meeting.invited");
    assert.equal(n.link, `/calendar?event=${ev.id}`);

    const { rows } = await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1", [emp.email]);
    const invite = rows.find((r) => r.payload.subject === "Invitation: Sprint planning");
    assert.equal(invite.payload.icalEvent.method, "REQUEST");
    assert.match(invite.payload.icalEvent.content, new RegExp(`UID:${ev.id}@`));

    const listed = (await api.call("GET", `/calendar/events?${range()}`, { token: intern.token })).json.events;
    assert.ok(listed.some((e) => e.id === ev.id && e.myResponse === "needs_action" && !e.canEdit));
    const hidden = (await api.call("GET", `/calendar/events?${range()}`, { token: outsider.token })).json.events;
    assert.ok(!hidden.some((e) => e.id === ev.id));
    assert.equal((await api.call("GET", `/calendar/events/${ev.id}`, { token: outsider.token })).status, 404);

    const ics = await fetch(`${api.base}/calendar/events/${ev.id}/ics`, { headers: { Authorization: `Bearer ${intern.token}` } });
    assert.equal(ics.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.match(await ics.text(), /SUMMARY:Sprint planning/);
  });

  test("validation: end after start, manual needs a link, unconfigured Meet is refused, candidates can't schedule", async () => {
    const bad = await api.call("POST", "/calendar/events", { token: manager.token, body: { title: "Oops", startsAt: inHours(5), endsAt: inHours(4) } });
    assert.equal(bad.status, 400);
    const noLink = await api.call("POST", "/calendar/events", { token: manager.token, body: { title: "Call", startsAt: inHours(5), endsAt: inHours(6), provider: "manual" } });
    assert.equal(noLink.status, 400);
    const meet = await api.call("POST", "/calendar/events", { token: manager.token, body: { title: "Call", startsAt: inHours(5), endsAt: inHours(6), provider: "google_meet" } });
    assert.equal(meet.status, 400);
    assert.equal(meet.json.error.code, "PROVIDER_NOT_CONFIGURED");
    const cand = await api.call("POST", "/calendar/events", { token: candidate.token, body: { title: "Call", startsAt: inHours(5), endsAt: inHours(6) } });
    assert.equal(cand.status, 403);
    const providers = (await api.call("GET", "/calendar/providers", { token: emp.token })).json.providers;
    assert.deepEqual(providers.map((p) => [p.name, p.configured]), [["manual", true], ["google_meet", false], ["zoom", false]]);
  });

  test("RSVPs, moving the meeting, removing someone and cancelling", async () => {
    const ev = (await api.call("POST", "/calendar/events", { token: manager.token, body: { title: "1:1", startsAt: inHours(72), endsAt: inHours(73), attendeeIds: [emp.id, intern.id] } })).json.event;

    assert.equal((await api.call("POST", `/calendar/events/${ev.id}/respond`, { token: emp.token, body: { response: "declined" } })).json.response, "declined");
    assert.ok((await inbox(manager)).some((n) => n.kind === "meeting.response" && n.link === `/calendar?event=${ev.id}`));
    assert.equal((await api.call("POST", `/calendar/events/${ev.id}/respond`, { token: outsider.token, body: { response: "accepted" } })).status, 404);

    // Only the organiser edits.
    assert.equal((await api.call("PUT", `/calendar/events/${ev.id}`, { token: emp.token, body: { title: "Hijack", startsAt: inHours(72), endsAt: inHours(73) } })).status, 403);

    const moved = await api.call("PUT", `/calendar/events/${ev.id}`, { token: manager.token, body: { title: "1:1", startsAt: inHours(96), endsAt: inHours(97), attendeeIds: [emp.id] } });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.event.attendees.length, 2);
    assert.equal(moved.json.event.attendees.find((a) => a.id === emp.id).response, "needs_action"); // asked again
    assert.ok((await inbox(emp)).some((n) => n.kind === "meeting.updated" && /moved/i.test(n.title)));
    assert.ok((await inbox(intern)).some((n) => n.kind === "meeting.cancelled"));
    const { rows } = await api.pool.query("SELECT payload FROM jobs WHERE type = 'email.send' AND payload->>'to' = $1 AND payload->>'subject' = 'Cancelled: 1:1'", [intern.email]);
    assert.equal(rows[0].payload.icalEvent.method, "CANCEL");

    assert.equal((await api.call("POST", `/calendar/events/${ev.id}/cancel`, { token: manager.token })).status, 200);
    const after = (await api.call("GET", `/calendar/events?${range()}`, { token: emp.token })).json.events;
    assert.ok(!after.some((e) => e.id === ev.id));
    assert.ok((await inbox(emp)).some((n) => n.kind === "meeting.cancelled" && n.title === "Cancelled: 1:1"));
  });

  test("my open tasks show on their due date", async () => {
    const task = (await api.call("POST", "/tasks", { token: manager.token, body: { title: "Send the deck", assigneeId: emp.id, dueDate: inHours(30) } })).json.task;
    const events = (await api.call("GET", `/calendar/events?${range()}`, { token: emp.token })).json.events;
    const due = events.find((e) => e.id === `task:${task.id}`);
    assert.equal(due.kind, "task_due");
    assert.equal(due.link, `/tasks/${task.id}`);
  });

  test("attendees get a reminder shortly before the start, except those who declined", { timeout: 40_000 }, async () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    const end = new Date(Date.now() + 40 * 60_000).toISOString();
    const ev = (await api.call("POST", "/calendar/events", { token: manager.token, body: { title: "Quick sync", startsAt: soon, endsAt: end, attendeeIds: [emp.id, intern.id] } })).json.event;
    await api.call("POST", `/calendar/events/${ev.id}/respond`, { token: intern.token, body: { response: "declined" } });
    const until = Date.now() + 30_000;
    let reminder;
    while (!reminder && Date.now() < until) {
      reminder = (await inbox(emp)).find((n) => n.kind === "meeting.starting" && n.link === `/calendar?event=${ev.id}`);
      if (!reminder) await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(reminder, "no reminder arrived");
    assert.match(reminder.title, /Starting in \d+ min: Quick sync/);
    assert.ok(!(await inbox(intern)).some((n) => n.kind === "meeting.starting" && n.link === `/calendar?event=${ev.id}`));
  });
});
