// AGENT MODE — loop batch: PII shield, plain-English explanations, per-client stats,
// and the flagship Plan Preview / Trust Map.
import assert from "node:assert/strict";
import { shieldPII } from "../src/agent/pii.js";
import { explainAction } from "../src/agent/explain.js";
import { previewPlan } from "../src/agent/plan.js";
import { createAgentService } from "../src/agent/service.js";
import { openMemory } from "../src/store.js";

// ── Cycle 1 · PII shield ───────────────────────────────────────────────────────
{
  const r = shieldPII("Customer SSN 123-45-6789, card 4111 1111 1111 1111, email a@b.com, cell 562-573-5967");
  assert.equal(r.redactions, 4, "4 PII values redacted");
  assert.equal(/123-45-6789|4111|a@b\.com/.test(r.text), false, "no raw PII remains");
  assert.match(r.text, /«ssn».*«card».*«email».*«phone»/, "PII replaced with typed placeholders");
  assert.equal(shieldPII("Your invoice is 18 days overdue.").redactions, 0, "clean text untouched");
  console.log("  ✓ PII shield — SSN/card/email/phone hidden from the model before planning");
}

// ── Cycle 2 · Explanations ─────────────────────────────────────────────────────
{
  assert.match(explainAction({ type: "send_email", to: "x@y.com", subject: "Hi" }), /Ready to send an email to x@y\.com.*approve/i);
  assert.match(explainAction({ type: "submit" }), /Ready to submit this form.*approve/i);
  assert.match(explainAction({ type: "password_entry" }), /won't.*handed this step to you/i);
  assert.match(explainAction({ type: "navigate", url: "https://nabis.pro/x" }), /Open nabis\.pro/);
  console.log("  ✓ explanations — client-readable copy for send / submit / refuse / navigate");
}

// ── Flagship · Plan Preview & Trust Map ────────────────────────────────────────
{
  const p = previewPlan("chase my overdue invoices");
  assert.equal(p.recipe, "chase_invoices");
  assert.equal(p.steps.length, 3);
  assert.equal(p.willPause, 1, "exactly the send step pauses for approval");
  assert.equal(p.willRefuse, 0);
  assert.equal(p.steps.find((s) => s.step.match(/Send/)).gate, "pause for your approval", "send step is a pause");
  assert.equal(p.steps[0].gate, "auto", "reading is auto");

  const r = previewPlan("research the top vendors");
  assert.equal(r.recipe, "research");
  assert.equal(r.willPause, 0, "pure research pauses on nothing (read-only)");

  const f = previewPlan("fill the application form");
  assert.equal(f.willPause, 1, "form fill pauses before submit");

  const g = previewPlan("do something unusual");
  assert.equal(g.recipe, "general", "unknown assignment → a general plan, still pauses before sending");
  assert.ok(g.willPause >= 1);
  console.log("  ✓ Plan Preview — per-step trust map (auto / pause / refuse) before anything runs");
}

// ── Cycle 3 · Stats + PII recorded in a real run ───────────────────────────────
{
  const store = openMemory();
  const browser = { observe: async () => ({ url: "https://ok.test", text: "Buyer SSN 111-22-3333 wants a recap", html: "<p>ok</p>" }), act: async () => {} };
  const svc = createAgentService({ store, config: { offline: true }, browser, planner: async () => ({ type: "send_email", to: "c@x.com", subject: "Recap", body: "hi" }), openPage: async () => ({}) });
  svc.allowDomain("acme", "ok.test");
  const res = await svc.assign("acme", "email a recap to my client");
  assert.equal(res.status, "parked_approval");
  assert.match(res.held.explain, /Ready to send an email/i, "held payload carries the explanation");

  const st = svc.stats("acme");
  assert.equal(st.tasks, 1);
  assert.equal(st.approvalsRequested, 1, "one approval requested");
  assert.equal(st.piiRedactions, 1, "the SSN on the page was shielded from the model");
  assert.ok(st.allowlist.includes("ok.test"));
  console.log("  ✓ stats — tasks/approvals/PII-redactions/domains; PII shielded during a real run");
}

console.log("✓ agent-loop");
