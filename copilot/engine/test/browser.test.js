// Browser doer (Playwright). Injects a fake page so it runs with no browser
// install — proves read navigates+reads, act clicks/fills, and the risk classes.
import assert from "node:assert/strict";
import gui from "../src/tools/gui.js";

const read = gui.find((t) => t.id === "browser.read");
const act = gui.find((t) => t.id === "browser.act");

// risk classes: read runs, act is world-changing (held)
assert.equal(read.risk, "read");
assert.equal(act.risk, "post");

// offline → simulated
assert.equal((await read.run({ url: "https://x" }, { offline: true })).simulated, true);
assert.equal((await act.run({ action: "click", selector: "#x" }, { offline: true })).simulated, true);

// live read via injected page
{
  const calls = [];
  const page = { goto: async (u) => calls.push(["goto", u]), innerText: async (s) => { calls.push(["innerText", s]); return "Hello world"; } };
  const r = await read.run({ url: "https://shop.com" }, { offline: false, page });
  assert.equal(r.text, "Hello world");
  assert.deepEqual(calls[0], ["goto", "https://shop.com"]);
}

// live act: click + fill, and unknown action rejected
{
  const calls = [];
  const page = { click: async (s) => calls.push(["click", s]), fill: async (s, v) => calls.push(["fill", s, v]), goto: async () => {} };
  assert.equal((await act.run({ action: "click", selector: "#buy" }, { offline: false, page })).done, true);
  await act.run({ action: "fill", selector: "#qty", value: "5" }, { offline: false, page });
  assert.deepEqual(calls, [["click", "#buy"], ["fill", "#qty", "5"]]);
  await assert.rejects(act.run({ action: "teleport" }, { offline: false, page }), /unknown action/);
}

console.log("✓ browser");
