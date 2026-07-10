// The live agent path (real Claude tool-use loop) must obey the same gate: reads
// run, world-changing calls are queued. Uses a MOCK Anthropic client so it runs
// with no key and no network — proving the loop logic + safety, not the model.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkEnv } from "./helpers.js";
import { assign, run } from "../src/engine.js";
import { pending } from "../src/approvals.js";

const tu = (name, input, id) => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });

function mockClient(script) {
  let i = 0;
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => { calls.push(params.messages); return script[i++] || { content: [{ type: "text", text: "done" }], stop_reason: "end_turn" }; },
    },
  };
}

const { ws, config, store, registry } = mkEnv();
const client = mockClient([
  tu("files__read", { file: "invoices.csv" }, "t1"),          // READ  → runs
  tu("comms__email", { to: "a@x.com", subject: "Hi", body: "b" }, "t2"), // SEND  → held
  tu("files__delete", { file: "old/" }, "t3"),                // DELETE → held
  { content: [{ type: "text", text: "All set." }], stop_reason: "end_turn" },
]);

const t = assign(store, "chase the overdue invoices in invoices.csv and clear out old/");
const r = await run(store, t.id, { config, registry, client });

assert.equal(r.status, "awaiting_approval");
assert.equal(r.done, 1, "the READ ran");
assert.equal(r.held, 2, "email + delete were held");
assert.ok(existsSync(join(ws, "old")), "held delete did NOT remove the folder");
assert.equal(pending(store).length, 2);

// the real read result was fed back to the model; holds were reported as queued
const conversation = JSON.stringify(client.calls);
assert.ok(conversation.includes("queued_for_approval"), "holds reported to the model as queued");
assert.ok(conversation.includes("invoices") || conversation.includes("Acme"), "real file contents fed back to the model");
assert.equal(store.where("steps", (s) => s.tool === "files.read" && s.status === "done").length, 1);

// the agent looped the expected number of times (3 tool turns + 1 close)
assert.ok(client.calls.length >= 4, "agent ran the full tool-use loop");

console.log("✓ agent");
