import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { startServer } from "./helpers.mjs";

const SECRET = "cf-test-secret";
let api, hr, admin, fake;

// A stand-in for Cashfree's /orders API.
function startFakeCashfree() {
  const orders = new Map();
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/orders") {
        const b = JSON.parse(body);
        const order = { order_id: b.order_id, order_amount: b.order_amount, order_status: "ACTIVE", payment_session_id: `session_${b.order_id}` };
        orders.set(b.order_id, order);
        res.end(JSON.stringify(order));
        return;
      }
      const m = req.url.match(/^\/orders\/([^/]+)$/);
      if (req.method === "GET" && m && orders.has(decodeURIComponent(m[1]))) {
        res.end(JSON.stringify(orders.get(decodeURIComponent(m[1]))));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "not found" }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, orders, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

before(async () => {
  fake = await startFakeCashfree();
  api = await startServer({ CASHFREE_APP_ID: "cf-app", CASHFREE_SECRET_KEY: SECRET, CASHFREE_API_BASE: fake.url });
  hr = await api.createUser("hr");
  admin = await api.createUser("admin");
});
after(async () => {
  await api?.stop();
  fake?.server.close();
});

async function passedHr({ programFee = 4999, trialHours } = {}) {
  const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: `Program ${randomUUID().slice(0, 6)}`, description: "Paid internship program", programFee, ...(trialHours !== undefined ? { trialHours } : {}) } })).json.opportunity;
  await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
  const candidate = await api.createUser("candidate");
  const application = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} })).json.application;
  await api.call("POST", `/applications/${application.id}/transition`, { token: hr.token, body: { toStatus: "under_review" } });
  const interview = (await api.call("POST", `/applications/${application.id}/interviews`, { token: hr.token, body: { interviewerId: hr.id, scheduledAt: new Date(Date.now() + 3600_000).toISOString() } })).json.interview;
  const fb = await api.call("POST", `/interviews/${interview.id}/feedback`, { token: hr.token, body: { feedback: "Good communication", decision: "pass" } });
  assert.equal(fb.status, 200, JSON.stringify(fb.json));
  return { opp, candidate, application, enrollment: fb.json.enrollment };
}

const journey = (candidate, applicationId) => api.call("GET", `/program/by-application/${applicationId}`, { token: candidate.token });
const status = async (id) => (await api.pool.query("SELECT status FROM applications WHERE id = $1", [id])).rows[0].status;

const joining = {
  fullName: "Asha Patil",
  phone: "9876543210",
  address: "12 MG Road, Kothrud",
  city: "Pune",
  emergencyContactName: "Ravi Patil",
  emergencyContactPhone: "9876500000",
  preferredStartDate: "2026-10-05",
  hoursPerWeek: 20,
  preferredSlots: ["weekday_evening", "weekend"],
  githubUsername: "asha-p",
};

function signed(body) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return { raw, headers: { "Content-Type": "application/json", "x-webhook-timestamp": ts, "x-webhook-signature": createHmac("sha256", SECRET).update(ts + raw).digest("base64") } };
}

describe("HR round to program", () => {
  test("an HR pass shortlists the candidate and asks them to pay or start a trial", async () => {
    const { candidate, application, enrollment } = await passedHr();
    assert.equal(enrollment.status, "awaiting_choice");
    assert.equal(Number(enrollment.amount), 4999);
    assert.equal(await status(application.id), "shortlisted");

    const view = await journey(candidate, application.id);
    assert.equal(view.status, 200);
    assert.equal(view.json.enrollment.id, enrollment.id);
    assert.equal(view.json.payments.enabled, true);
    assert.equal(view.json.interviews[0].feedback, undefined, "candidates don't see interview feedback");
    const note = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'program.payment_due'", [candidate.id]);
    assert.equal(note.rows[0].n, 1);
  });

  test("a fail or hold doesn't start the program", async () => {
    const opp = (await api.call("POST", "/opportunities", { token: hr.token, body: { title: "Hold role", description: "Paid internship program", programFee: 1000 } })).json.opportunity;
    await api.call("POST", `/opportunities/${opp.id}/publish`, { token: admin.token });
    const candidate = await api.createUser("candidate");
    const application = (await api.call("POST", `/applications/opportunities/${opp.id}/apply`, { token: candidate.token, body: {} })).json.application;
    const interview = (await api.call("POST", `/applications/${application.id}/interviews`, { token: hr.token, body: { interviewerId: hr.id, scheduledAt: new Date().toISOString() } })).json.interview;
    const fb = await api.call("POST", `/interviews/${interview.id}/feedback`, { token: hr.token, body: { feedback: "Not yet", decision: "hold" } });
    assert.equal(fb.json.enrollment, null);
    assert.equal((await journey(candidate, application.id)).json.enrollment, null);
  });

  test("the free trial runs once, allows the joining form, and expires", async () => {
    const { candidate, application, enrollment } = await passedHr({ trialHours: 24 });
    assert.equal((await api.call("PUT", `/program/enrollments/${enrollment.id}/joining`, { token: candidate.token, body: joining })).status, 409, "no joining form before choosing");

    const t = await api.call("POST", `/program/enrollments/${enrollment.id}/trial`, { token: candidate.token });
    assert.equal(t.status, 200);
    assert.equal(t.json.enrollment.status, "trial");
    const hours = (new Date(t.json.enrollment.trialEndsAt) - Date.now()) / 3600_000;
    assert.ok(hours > 23.9 && hours <= 24);
    assert.equal((await api.call("POST", `/program/enrollments/${enrollment.id}/trial`, { token: candidate.token })).status, 409);

    const j = await api.call("PUT", `/program/enrollments/${enrollment.id}/joining`, { token: candidate.token, body: joining });
    assert.equal(j.status, 200, JSON.stringify(j.json));
    assert.equal(j.json.enrollment.joiningDetails.city, "Pune");

    await api.pool.query("UPDATE program_enrollments SET trial_ends_at = now() - interval '1 minute' WHERE id = $1", [enrollment.id]);
    const after = await journey(candidate, application.id);
    assert.equal(after.json.enrollment.status, "trial_expired");
    assert.equal((await api.call("PUT", `/program/enrollments/${enrollment.id}/joining`, { token: candidate.token, body: joining })).status, 409);
    const ended = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'program.trial_ended'", [candidate.id]);
    assert.equal(ended.rows[0].n, 1);
  });

  test("openings with no trial don't offer one", async () => {
    const { candidate, enrollment } = await passedHr({ trialHours: 0 });
    const r = await api.call("POST", `/program/enrollments/${enrollment.id}/trial`, { token: candidate.token });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, "NO_TRIAL");
  });

  test("paying through Cashfree: order, return-page check, then paid", async () => {
    const { candidate, application, enrollment } = await passedHr();
    const pay = await api.call("POST", `/program/enrollments/${enrollment.id}/pay`, { token: candidate.token });
    assert.equal(pay.status, 201, JSON.stringify(pay.json));
    assert.match(pay.json.paymentSessionId, /^session_/);
    const sent = fake.seen.find((s) => s.method === "POST" && s.body.order_id === pay.json.orderId);
    assert.equal(sent.headers["x-api-version"], "2023-08-01");
    assert.equal(sent.body.order_amount, 4999);
    assert.equal(sent.body.customer_details.customer_phone, "9000000000");
    assert.match(sent.body.order_meta.return_url, new RegExp(`/journey/${application.id}\\?order_id=\\{order_id\\}$`));

    const early = await api.call("POST", `/program/enrollments/${enrollment.id}/verify`, { token: candidate.token, body: { orderId: pay.json.orderId } });
    assert.equal(early.json.orderStatus, "ACTIVE");
    assert.equal(early.json.enrollment.status, "awaiting_choice");

    fake.orders.get(pay.json.orderId).order_status = "PAID";
    const done = await api.call("POST", `/program/enrollments/${enrollment.id}/verify`, { token: candidate.token, body: { orderId: pay.json.orderId } });
    assert.equal(done.json.enrollment.status, "paid");
    const order = await api.pool.query("SELECT status FROM payment_orders WHERE order_id = $1", [pay.json.orderId]);
    assert.equal(order.rows[0].status, "paid");
    assert.equal((await api.call("POST", `/program/enrollments/${enrollment.id}/pay`, { token: candidate.token })).status, 409);
    const hrNote = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'program.paid'", [hr.id]);
    assert.ok(hrNote.rows[0].n >= 1);
  });

  test("the webhook checks the signature and the amount", async () => {
    const { candidate, enrollment } = await passedHr({ programFee: 2500 });
    const { orderId } = (await api.call("POST", `/program/enrollments/${enrollment.id}/pay`, { token: candidate.token })).json;
    const post = (s) => fetch(`${api.base}/payments/cashfree/webhook`, { method: "POST", headers: s.headers, body: s.raw });
    const event = (amount) => ({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: orderId, order_amount: amount }, payment: { cf_payment_id: 12345, payment_status: "SUCCESS" } } });

    const forged = signed(event(2500));
    forged.headers["x-webhook-signature"] = "bm9wZQ==";
    assert.equal((await post(forged)).status, 401);
    assert.equal((await post(signed(event(1)))).status, 400);
    assert.equal((await post(signed({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "someone-elses-order" } } }))).status, 200);

    assert.equal((await post(signed(event(2500)))).status, 200);
    assert.equal((await post(signed(event(2500)))).status, 200, "replays are harmless");
    const row = await api.pool.query("SELECT e.status, o.gateway_payment_id FROM program_enrollments e JOIN payment_orders o ON o.enrollment_id = e.id WHERE e.id = $1", [enrollment.id]);
    assert.equal(row.rows[0].status, "paid");
    assert.equal(row.rows[0].gateway_payment_id, "12345");
    const paidNotes = await api.pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'program.paid'", [candidate.id]);
    assert.equal(paidNotes.rows[0].n, 1);
  });

  test("no fee: straight to the joining form", async () => {
    const { candidate, application, enrollment } = await passedHr({ programFee: null });
    assert.equal(enrollment.status, "waived");
    assert.equal((await api.call("PUT", `/program/enrollments/${enrollment.id}/joining`, { token: candidate.token, body: joining })).status, 200);
    const profile = await api.pool.query("SELECT full_name FROM candidate_profiles WHERE user_id = $1", [candidate.id]);
    assert.equal(profile.rows[0].full_name, "Asha Patil");
    assert.equal((await journey(candidate, application.id)).json.enrollment.joiningDetails.preferredStartDate, "2026-10-05");
  });

  test("staff can mark paid or waive; candidates can't; the applicants list shows it all", async () => {
    const { opp, candidate, application, enrollment } = await passedHr();
    assert.equal((await api.call("POST", `/program/enrollments/${enrollment.id}/mark-paid`, { token: candidate.token, body: {} })).status, 403);
    const other = await api.createUser("candidate");
    assert.equal((await journey(other, application.id)).status, 403);

    const marked = await api.call("POST", `/program/enrollments/${enrollment.id}/mark-paid`, { token: hr.token, body: { note: "Bank transfer UTR 1234" } });
    assert.equal(marked.json.enrollment.status, "paid");
    assert.equal(marked.json.enrollment.paymentNote, "Bank transfer UTR 1234");
    assert.equal((await api.call("POST", `/program/enrollments/${enrollment.id}/waive`, { token: hr.token, body: {} })).status, 409);

    const list = await api.call("GET", `/program/applicants?opportunityId=${opp.id}`, { token: hr.token });
    assert.equal(list.status, 200);
    const row = list.json.applicants.find((a) => a.id === application.id);
    assert.equal(row.enrollmentStatus, "paid");
    assert.equal(row.interview.decision, "pass");
    assert.equal(row.email, candidate.email);
    assert.equal((await api.call("GET", `/program/applicants?opportunityId=${opp.id}`, { token: candidate.token })).status, 403);
  });
});
