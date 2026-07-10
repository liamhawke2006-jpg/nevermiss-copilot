import assert from "node:assert/strict";
import { decide, isSafe, RISK, WORLD_CHANGING } from "../src/risk.js";

// default policy: read auto, everything else held
assert.equal(decide(RISK.READ), "auto");
for (const r of [RISK.WRITE, RISK.DELETE, RISK.SEND, RISK.PAY, RISK.POST, RISK.EXEC]) assert.equal(decide(r), "hold", `${r} must hold`);

// alternate policies
assert.equal(decide(RISK.SEND, "full-auto"), "auto");
assert.equal(decide(RISK.READ, "approve-everything"), "hold");

assert.ok(isSafe(RISK.READ) && !isSafe(RISK.WRITE));
assert.equal(WORLD_CHANGING.has(RISK.READ), false);
assert.equal(WORLD_CHANGING.has(RISK.EXEC), true);

console.log("✓ risk");
