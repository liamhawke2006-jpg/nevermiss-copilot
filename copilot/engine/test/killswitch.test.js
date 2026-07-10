// Capability kill switch: a disabled domain can never run — its steps are
// blocked, not held, not executed.
import assert from "node:assert/strict";
import { mkEnv } from "./helpers.js";
import { assign, run } from "../src/engine.js";
import { pending } from "../src/approvals.js";

const { config, store, registry } = mkEnv({ capabilities: { comms: false } });
const t = assign(store, "chase the overdue invoices in invoices.csv");
await run(store, t.id, { config, registry });

assert.equal(pending(store).length, 0, "no held actions when comms is off");
const steps = store.where("steps", (s) => s.task_id === t.id);
assert.ok(steps.some((s) => s.tool === "files.read" && s.status === "done"), "safe read still ran");
assert.ok(steps.some((s) => s.tool === "comms.email" && s.status === "blocked"), "email steps blocked");
assert.ok(!registry.has("comms.email") && registry.isKnownButDisabled("comms.email"));

console.log("✓ killswitch");
