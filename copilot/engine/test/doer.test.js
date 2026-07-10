// First real doer: comms.email actually sends via SendGrid when live. Uses a
// mocked global fetch so it runs with no key and no network — proving the request
// shape and the held→approve→SENT loop.
import assert from "node:assert/strict";
import net from "../src/tools/net.js";
import { mkEnv } from "./helpers.js";
import { assign, run } from "../src/engine.js";
import { approve, pending } from "../src/approvals.js";

const email = net.find((t) => t.id === "comms.email");

// offline → simulated (no real send)
assert.equal((await email.run({ to: "a@b.com", subject: "Hi", body: "yo" }, { offline: true })).simulated, true);

// live but unconfigured → clear error
await assert.rejects(email.run({ to: "a@b.com" }, { offline: false, config: { sendgrid: { key: "" } } }), /SENDGRID_API_KEY/);

// live + key → POSTs the correct SendGrid payload
{
  const orig = globalThis.fetch; let captured = null;
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 202, text: async () => "" }; };
  try {
    const r = await email.run({ to: "buyer@shop.com", subject: "Invoice", body: "Hello" },
      { offline: false, config: { sendgrid: { key: "SG.test", from: "ops@distro.com" } } });
    assert.equal(r.sent, true); assert.equal(r.provider, "sendgrid");
    assert.match(captured.url, /api\.sendgrid\.com\/v3\/mail\/send/);
    assert.match(captured.opts.headers.authorization, /Bearer SG\.test/);
    const b = JSON.parse(captured.opts.body);
    assert.equal(b.personalizations[0].to[0].email, "buyer@shop.com");
    assert.equal(b.from.email, "ops@distro.com");
    assert.equal(b.subject, "Invoice");
  } finally { globalThis.fetch = orig; }
}

// end-to-end: an email stays HELD until approved, then really sends.
{
  const orig = globalThis.fetch; let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, status: 202, text: async () => "" }; };
  try {
    const { config, store, registry } = mkEnv({ offline: false, sendgrid: { key: "SG.e2e", from: "ops@x.com" } });
    const t = assign(store, "chase the overdue invoices in invoices.csv");
    await run(store, t.id, { config, registry });
    const held = pending(store).find((h) => h.tool === "comms.email");
    assert.ok(held, "email was held");
    assert.equal(called, false, "nothing sent while held");
    await approve(store, held.id, { config, registry });
    assert.equal(called, true, "approved email actually sent via SendGrid");
    assert.equal(store.get("held", held.id).status, "executed");
  } finally { globalThis.fetch = orig; }
}

console.log("✓ doer");
