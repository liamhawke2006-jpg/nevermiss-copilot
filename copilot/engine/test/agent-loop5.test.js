// AGENT MODE — loop batch 5 (c31-40 + FLAGSHIP Ask-First): confidence, ambiguity,
// the clarification engine, approval roles, recurring tasks, email-approval tokens.
import assert from "node:assert/strict";
import { clarify } from "../src/agent/clarify.js";
import { detectAmbiguity } from "../src/agent/ambiguity.js";
import { confidenceOf } from "../src/agent/confidence.js";
import { approvalRole, canApprove } from "../src/agent/roles.js";
import { scheduleTask, dueSchedules, markRun } from "../src/agent/schedule.js";
import { approvalToken, verifyApprovalToken } from "../src/agent/approvetoken.js";
import { createAgentService } from "../src/agent/service.js";
import { openMemory } from "../src/store.js";

const fakeBrowser = () => ({ observe: async () => ({ url: "https://ok.test", text: "hi", html: "<p>hi</p>" }), act: async () => {} });

// ── FLAGSHIP c40 · Ask-First clarification ─────────────────────────────────────
{
  // Ambiguous assignments → a crisp question, not a guess.
  assert.match(clarify({ assignment: "email a recap" }), /Who should I send/);
  assert.match(clarify({ assignment: "book an appointment" }), /day and time/);
  assert.match(clarify({ assignment: "buy office supplies" }), /budget/);
  // Complete assignment → no question.
  assert.equal(clarify({ assignment: "email a recap to my client" }), null);
  assert.equal(clarify({ assignment: "research the top 3 vendors" }), null);
  // Not-ambiguous assignment but a low-confidence step → asks about the step.
  assert.match(clarify({ assignment: "open the vendor page", action: { type: "navigate" } }), /not confident/i);
  assert.equal(confidenceOf({ type: "navigate" }).score < 0.55, true);

  // In the service: an ambiguous send pauses to ASK instead of running.
  const store = openMemory();
  const svc = createAgentService({ store, config: { offline: true }, browser: fakeBrowser(), planner: async () => ({ type: "send_email", to: "c@x.com", subject: "R", body: "b" }), openPage: async () => ({}) });
  svc.allowDomain("acme", "ok.test");
  const r = await svc.assign("acme", "email a recap");
  assert.equal(r.status, "needs_clarification", "ambiguous task pauses to ask");
  assert.match(r.question, /Who should I send/);
  // With a recipient it proceeds and parks the send for approval.
  const r2 = await svc.assign("acme", "email a recap to my client");
  assert.equal(r2.status, "parked_approval", "a complete task proceeds normally");
  console.log("  ✓ c40 FLAGSHIP Ask-First — pauses to ask on ambiguity/low confidence; proceeds when clear");
}

// ── c31/c32 · confidence + ambiguity units ─────────────────────────────────────
{
  assert.equal(detectAmbiguity("send it").ambiguous, true);
  assert.equal(detectAmbiguity("reply to john@acme.com").ambiguous, false);
  assert.ok(confidenceOf({ type: "send_email", to: "a@b.com" }).score > 0.8);
  assert.ok(confidenceOf({ type: "send_email" }).score < 0.55, "no recipient → low confidence");
  console.log("  ✓ c31/c32 confidence + ambiguity signals");
}

// ── c33 · approval roles ───────────────────────────────────────────────────────
{
  assert.equal(approvalRole({ type: "purchase" }), "manager");
  assert.equal(approvalRole({ type: "send_email" }), "owner");
  assert.equal(canApprove("owner", { type: "send_email" }), true, "owner can approve a send");
  assert.equal(canApprove("owner", { type: "purchase" }), false, "owner CANNOT approve a purchase");
  assert.equal(canApprove("manager", { type: "purchase" }), true, "manager can approve a purchase");
  console.log("  ✓ c33 approval roles — purchases/publishes need a manager sign-off");
}

// ── c34 · recurring tasks ──────────────────────────────────────────────────────
{
  const store = openMemory();
  const s = scheduleTask(store, { clientId: "acme", dow: 1, time: "07:00", prompt: "chase overdue invoices" });
  assert.equal(dueSchedules(store, { dow: 1, hhmm: "07:00", day: "2026-07-13" }).length, 1, "due Monday 07:00");
  assert.equal(dueSchedules(store, { dow: 2, hhmm: "07:00", day: "2026-07-13" }).length, 0, "not due Tuesday");
  markRun(store, s.id, "2026-07-13");
  assert.equal(dueSchedules(store, { dow: 1, hhmm: "07:00", day: "2026-07-13" }).length, 0, "won't re-run the same day");
  console.log("  ✓ c34 recurring tasks — due on schedule, once per day");
}

// ── c35 · approve-from-email tokens ────────────────────────────────────────────
{
  const t = approvalToken("acme", 5, "s3cret");
  const v = verifyApprovalToken(t, "s3cret");
  assert.equal(v.valid, true);
  assert.equal(v.taskId, 5);
  assert.equal(verifyApprovalToken(t + "x", "s3cret").valid, false, "tampered token rejected");
  assert.equal(verifyApprovalToken(t, "wrong-secret").valid, false, "wrong secret rejected");
  console.log("  ✓ c35 email-approval tokens — HMAC-signed, unforgeable, task-scoped");
}

console.log("✓ agent-loop5");
