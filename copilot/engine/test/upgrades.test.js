// Upgrades 1–10 — audit, deny reasons, TTL expiry, daily cap, redaction,
// idempotent approve, health, actionable errors, self-test, action detail.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkEnv } from "./helpers.js";
import { nowIso } from "../src/store.js";
import { approve, deny, expireStale } from "../src/approvals.js";
import { previewOf, detailOf } from "../src/preview.js";
import { auditLog } from "../src/audit.js";
import { healthPayload } from "../src/health.js";
import { humanize } from "../src/errors.js";
import { redact } from "../src/redact.js";
import { openTenants, selfTest } from "../src/provision.js";

function seedHeld(store, { tool = "comms.email", risk = "send", args = { to: "a@b.com", subject: "Hi", body: "hello" }, created_at = nowIso() } = {}) {
  const task = store.insert("tasks", { prompt: "t", status: "awaiting_approval", created_at: nowIso() });
  const step = store.insert("steps", { task_id: task.id, tool, args, risk, decision: "hold", status: "held", why: "w" });
  const held = store.insert("held", { task_id: task.id, step_id: step.id, tool, args, risk, preview: previewOf(tool, args), why: "w", status: "pending", created_at, resolved_at: null, result: null });
  return { task, step, held };
}

// ── U5 · redaction ───────────────────────────────────────────────────────────
assert.equal(redact("key SG.AbcDef1234567890xyz here").includes("SG."), false, "SendGrid key scrubbed");
assert.match(redact("token sk-ant-api03-SECRETSECRET"), /«redacted»/, "Anthropic key scrubbed");
assert.equal(redact({ refresh: "1//realtokenvalue000000", to: "a@b.com" }).refresh, "«redacted»", "secret-named field masked");
assert.equal(redact({ to: "a@b.com" }).to, "a@b.com", "ordinary fields preserved");

// ── U8 · actionable errors ─────────────────────────────────────────────────────
assert.match(humanize("Gmail not connected for this tenant"), /Connect Gmail/, "Gmail error humanized");
assert.match(humanize("comms.email not configured: set SENDGRID_API_KEY"), /SendGrid/, "SendGrid error humanized");
assert.equal(humanize("some novel error"), "some novel error", "unknown errors pass through");

// ── U10 · full action detail (redacted) ────────────────────────────────────────
const det = detailOf("comms.email", { to: "x@y.com", subject: "Re: order", body: "Thanks! token SG.LEAK1234567890abc" });
assert.equal(det.kind, "email");
assert.equal(det.to, "x@y.com");
assert.equal(det.body.includes("SG."), false, "secret redacted inside the previewed body");
assert.equal(detailOf("shell.exec", { cmd: "rm -rf build" }).command, "rm -rf build");

// ── U1 · audit + U2 · deny reason ──────────────────────────────────────────────
{
  const { store, config, registry } = mkEnv();
  const a = seedHeld(store);
  await approve(store, a.held.id, { config, registry });   // simulated send (offline)
  const b = seedHeld(store);
  deny(store, b.held.id, "wrong recipient");
  const log = auditLog(store);
  const types = log.map((e) => e.type);
  assert.ok(types.includes("approved"), "audit records approvals");
  assert.ok(types.includes("denied"), "audit records denials");
  assert.equal(store.get("held", b.held.id).reason, "wrong recipient", "deny reason stored");
  assert.ok(log.find((e) => e.type === "denied").meta.reason === "wrong recipient", "reason in audit meta");
}

// ── U3 · TTL expiry ────────────────────────────────────────────────────────────
{
  const { store, config, registry } = mkEnv();
  const old = seedHeld(store, { created_at: "2000-01-01 00:00:00" });
  const fresh = seedHeld(store);
  const expired = expireStale(store, 60); // 60-min TTL
  assert.deepEqual(expired, [old.held.id], "only the stale action expired");
  assert.equal(store.get("held", old.held.id).status, "expired");
  assert.equal(store.get("held", fresh.held.id).status, "pending", "fresh action untouched");
  await assert.rejects(() => approve(store, old.held.id, { config, registry }), /no pending/, "an expired action can't be approved");
}

// ── U4 · daily send cap ────────────────────────────────────────────────────────
{
  const { store, config, registry } = mkEnv({ maxSendsPerDay: 1 });
  const first = seedHeld(store);
  const second = seedHeld(store);
  await approve(store, first.held.id, { config, registry });
  const r2 = await approve(store, second.held.id, { config, registry });
  assert.equal(store.get("held", first.held.id).status, "executed", "first send goes through");
  assert.equal(r2.status, "blocked_rate", "second send blocked by the daily cap");
  assert.match(r2.result.error, /cap/, "cap reason recorded");
}

// ── U6 · idempotent approve (no double-execute) ────────────────────────────────
{
  const { store, config } = mkEnv();
  let runs = 0;
  const reg = { get: () => ({ run: async () => { runs++; return { ok: true }; } }) };
  const h = seedHeld(store);
  const p1 = approve(store, h.held.id, { config, registry: reg });
  const p2 = approve(store, h.held.id, { config, registry: reg }).catch((e) => e);
  await p1; const e2 = await p2;
  assert.equal(runs, 1, "the action executed exactly once");
  assert.ok(e2 instanceof Error, "the duplicate approve was rejected");
}

// ── U7 · health payload ────────────────────────────────────────────────────────
{
  const { store, config } = mkEnv();
  seedHeld(store);
  const h = healthPayload(config, store, { startMs: 1000, nowMs: 6000 });
  assert.equal(h.ok, true);
  assert.equal(h.mode, "demo", "offline env reports demo mode");
  assert.equal(h.pending, 1, "counts pending held actions");
  assert.equal(h.uptimeSec, 5, "computes uptime");
  assert.ok(h.version && h.capabilities, "reports version + capabilities");
}

// ── U9 · connection self-test ──────────────────────────────────────────────────
{
  const reg = openTenants(join(mkdtempSync(join(tmpdir(), "tn-")), "tenants.json"));
  const demo = reg.create({ name: "Demo Co", mode: "demo", autonomy: "auto-safe-hold-world", capabilities: { comms: true }, anthropicKey: "sk-ant-xyz" });
  const st = await selfTest(reg.get(demo.id));
  assert.equal(st.checks.brain.ok, true, "brain key format verified");
  assert.match(st.checks.sendReal, /demo/, "demo tenant flagged: approvals simulated");
  assert.equal(st.ready, true, "demo tenant is 'ready' (nothing to actually send)");
  const live = reg.create({ name: "Live Co", mode: "live", autonomy: "auto-safe-hold-world", capabilities: { comms: true }, anthropicKey: "sk-ant-xyz", sendgridKey: "SG.abc", mailFrom: "o@x.com" });
  const st2 = await selfTest(reg.get(live.id));
  assert.match(st2.checks.sendReal, /live/, "live tenant flagged: approvals actually send");
}

console.log("✓ upgrades");
