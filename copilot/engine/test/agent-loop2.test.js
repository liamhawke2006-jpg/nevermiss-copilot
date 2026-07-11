// AGENT MODE — loop batch 2 (cycles 5–10): path-scoped allowlist, deterministic
// recipe scripts, structured export, approval diff, runtime-park, + FLAGSHIP replay.
import assert from "node:assert/strict";
import { newClientState } from "../src/agent/state.js";
import { approveDomain, isDomainAllowed } from "../src/agent/guards.js";
import { scriptedPlanner } from "../src/agent/recipes.js";
import { exportSession, buildReplay } from "../src/agent/replay.js";
import { diffState } from "../src/agent/diff.js";
import { runTask } from "../src/agent/loop.js";

// ── c5 · path-scoped allowlist ─────────────────────────────────────────────────
{
  const s = newClientState("acme");
  approveDomain(s, "nabis.pro/orders");
  assert.equal(isDomainAllowed(s, "https://nabis.pro/orders/123"), true, "under the approved path");
  assert.equal(isDomainAllowed(s, "https://app.nabis.pro/orders"), true, "subdomain under the path");
  assert.equal(isDomainAllowed(s, "https://nabis.pro/billing"), false, "OUTSIDE the approved path is blocked");
  approveDomain(s, "gmail.com"); // host-only entry allows any path
  assert.equal(isDomainAllowed(s, "https://gmail.com/anything"), true, "host-only entry allows any path");
  assert.equal(isDomainAllowed(s, "https://evil.com/orders"), false, "unrelated host blocked");
  console.log("  ✓ c5 path-scoped allowlist — approve nabis.pro/orders, can't wander to /billing");
}

// ── c6 · deterministic recipe scripts ──────────────────────────────────────────
{
  const p = scriptedPlanner("research the top vendors", null);
  const a1 = await p({}), a2 = await p({}), a3 = await p({});
  assert.deepEqual([a1.type, a2.type, a3.type], ["search", "extract", "done"], "research runs deterministically, no LLM");
  const none = scriptedPlanner("some novel unmatched task", async () => ({ type: "read" }));
  assert.equal((await none({})).type, "read", "unscripted assignment falls back to the LLM planner");
  console.log("  ✓ c6 recipe scripts — core jobs run deterministically; novel tasks use the LLM");
}

// ── c7 · structured export ─────────────────────────────────────────────────────
{
  const e = exportSession({ taskId: 9, clientId: "acme", assignment: "email a recap", steps: [{ action: { type: "send_email", token: "SG.SECRET1234567890" } }] });
  assert.match(e.filename, /agent-session-9\.json/);
  const parsed = JSON.parse(e.json);
  assert.equal(parsed.taskId, 9);
  assert.equal(JSON.stringify(parsed).includes("SG.SECRET"), false, "secrets redacted in the export");
  console.log("  ✓ c7 export — portable redacted JSON for compliance");
}

// ── c8 · approval diff ─────────────────────────────────────────────────────────
{
  const d = diffState("Name: \nCity: LA", "Name: Acme Co\nCity: LA");
  assert.ok(d.added.some((l) => /Acme Co/.test(l)), "shows what was added");
  assert.ok(d.removed.some((l) => /Name:\s*$/.test(l)), "shows what was replaced");
  assert.equal(diffState("same", "same").changed, 0, "no change → empty diff");
  console.log("  ✓ c8 approval diff — the client sees what changed before approving");
}

// ── c9 · runtime cap parks the task ────────────────────────────────────────────
{
  const state = newClientState("rt"); approveDomain(state, "ok.test");
  const acted = [];
  const browser = { observe: async () => ({ url: "https://ok.test", text: "hi", html: "<p>hi</p>" }), act: async (_p, a) => acted.push(a) };
  const res = await runTask({ state, assignment: "x", planner: async () => ({ type: "read" }), browser, page: {}, caps: { maxTaskRuntimeMin: 15, maxApprovalsPerDay: 25, maxEmailsPerDay: 20 }, startMs: 1, now: () => 1 + 16 * 60000 });
  assert.equal(res.status, "parked_timeout", "task parks when it blows past the runtime cap");
  assert.equal(acted.length, 0, "nothing executed past the cap");
  console.log("  ✓ c9 runtime cap — a task past 15 min parks + reports, doesn't run on");
}

// ── FLAGSHIP c10 · session replay engine ───────────────────────────────────────
{
  const session = {
    taskId: 5, clientId: "acme", assignment: "email a recap", status: "parked_approval", startedAt: "2026-07-11 10:00:00",
    steps: [
      { n: 1, ts: "2026-07-11 10:00:01", event: "pii_redacted", note: "1 PII value hidden from the model" },
      { n: 2, ts: "2026-07-11 10:00:02", action: { type: "read" }, tier: 1, decision: "auto", reason: "read-only" },
      { n: 3, ts: "2026-07-11 10:00:05", action: { type: "send_email", to: "client@x.com", subject: "Recap" }, tier: 2, decision: "hold", reason: "needs approval", explain: "Ready to send an email to client@x.com" },
    ],
  };
  const html = buildReplay(session);
  assert.match(html, /Session replay/);
  assert.match(html, /email a recap/, "shows the assignment");
  assert.match(html, /PII shielded/, "renders the PII-shield band");
  assert.match(html, /client@x\.com/, "shows the parked send target");
  assert.match(html, /pause · approval/, "tier-2 badge on the send");
  assert.match(html, /1 pauses/, "summary counts the pause");
  // A frozen session renders the injection band.
  const frozen = buildReplay({ taskId: 6, assignment: "read page", status: "frozen", steps: [{ event: "injection_freeze", evidence: ["ignore previous instructions"] }] });
  assert.match(frozen, /FROZEN — prompt injection/);
  console.log("  ✓ c10 FLAGSHIP replay — self-contained HTML timeline (steps, gates, PII/injection, screenshots)");
}

console.log("✓ agent-loop2");
