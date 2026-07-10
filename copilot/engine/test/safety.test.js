// THE core invariant: a world-changing action never executes until a human
// approves it. If this suite passes, "Copilot can do anything" is safe by default.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkEnv } from "./helpers.js";
import { assign, run } from "../src/engine.js";
import { approve, deny, pending } from "../src/approvals.js";
import { summary } from "../src/results.js";
import { WORLD_CHANGING } from "../src/risk.js";

// 1) A destructive task holds the deletion; the safe scan runs.
{
  const { ws, config, store, registry } = mkEnv();
  const t = assign(store, "clean up the old/ folder");
  const r = await run(store, t.id, { config, registry });
  assert.equal(r.status, "awaiting_approval");
  assert.equal(r.done, 1, "the safe files.list ran");
  assert.equal(r.held, 1, "the delete was held");
  assert.ok(existsSync(join(ws, "old")), "HELD delete did NOT remove the folder");
  assert.equal(summary(store).pending, 1);

  // every held action is world-changing; nothing safe got held
  const held = store.where("held", (h) => h.task_id === t.id);
  assert.ok(held.every((h) => WORLD_CHANGING.has(h.risk)), "only world-changing actions are held");
  // no held step is marked done before approval
  assert.equal(store.where("steps", (s) => s.decision === "hold" && s.status === "done").length, 0);
}

// 2) Approve → it actually happens.
{
  const { ws, config, store, registry } = mkEnv();
  const t = assign(store, "clean up the old/ folder");
  await run(store, t.id, { config, registry });
  const h = pending(store)[0];
  await approve(store, h.id, { config, registry });
  assert.ok(!existsSync(join(ws, "old")), "approved delete removed the folder");
  assert.equal(store.get("tasks", t.id).status, "done");
}

// 3) Deny → it never happens, and can't be re-run.
{
  const { ws, config, store, registry } = mkEnv();
  const t = assign(store, "clean up the old/ folder");
  await run(store, t.id, { config, registry });
  const h = pending(store)[0];
  deny(store, h.id);
  assert.ok(existsSync(join(ws, "old")), "denied delete kept the folder");
  assert.equal(pending(store).length, 0);
  assert.throws(() => deny(store, h.id), /no pending/);
}

// 4) A 'send' task (email) is held, not sent, until approval.
{
  const { config, store, registry } = mkEnv();
  const t = assign(store, "chase the overdue invoices in invoices.csv");
  const r = await run(store, t.id, { config, registry });
  assert.equal(r.status, "awaiting_approval");
  assert.ok(store.where("steps", (s) => s.tool === "files.read" && s.status === "done").length === 1, "reading the ledger auto-ran");
  const held = store.where("held", (h) => h.task_id === t.id);
  assert.ok(held.length >= 1 && held.every((h) => h.status === "pending" && h.tool === "comms.email"));
}

console.log("✓ safety");
