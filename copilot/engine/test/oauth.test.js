// Gmail OAuth flow + Gmail send doer. Mocked fetch — no Google round-trip, no
// creds — proves the auth URL, code exchange, and the send request are correct.
import assert from "node:assert/strict";
import { gmailAuthUrl, gmailConfigured, tenantFromState, exchangeCode } from "../src/oauth.js";
import net from "../src/tools/net.js";

const g = { clientId: "cid", clientSecret: "sec", redirectBase: "https://copilot.example.com" };

// configured checks
assert.equal(gmailConfigured(g), true);
assert.equal(gmailConfigured({}), false);
assert.throws(() => gmailAuthUrl("t1", {}), /not configured/);

// auth URL is a correct Google consent URL
const { url, state } = gmailAuthUrl("harbor-2", g);
const U = new URL(url);
assert.equal(U.origin + U.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
assert.equal(U.searchParams.get("client_id"), "cid");
assert.equal(U.searchParams.get("redirect_uri"), "https://copilot.example.com/api/oauth/gmail/callback");
assert.match(U.searchParams.get("scope"), /gmail\.send/);
assert.equal(U.searchParams.get("access_type"), "offline");
assert.ok(state.startsWith("harbor-2."));
assert.equal(tenantFromState(state), "harbor-2");

// code exchange (mock fetch)
{
  const orig = globalThis.fetch; let body;
  globalThis.fetch = async (_u, opts) => { body = opts.body.toString(); return { ok: true, json: async () => ({ access_token: "at", refresh_token: "rt" }) }; };
  try {
    const tok = await exchangeCode("thecode", g);
    assert.equal(tok.refresh_token, "rt");
    assert.match(body, /grant_type=authorization_code/);
    assert.match(body, /code=thecode/);
  } finally { globalThis.fetch = orig; }
}

// Gmail send doer
const gmail = net.find((t) => t.id === "comms.gmail");
assert.equal(gmail.risk, "send");
assert.equal((await gmail.run({ to: "a@b.com", subject: "Hi" }, { offline: true })).simulated, true);
await assert.rejects(gmail.run({ to: "a@b.com" }, { offline: false, config: { gmail: { refresh: "" } } }), /not connected/);
{
  const orig = globalThis.fetch; const calls = [];
  globalThis.fetch = async (u) => { calls.push(String(u));
    if (String(u).includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "AT" }) };
    return { ok: true, text: async () => "", json: async () => ({ id: "m1" }) }; };
  try {
    const r = await gmail.run({ to: "buyer@shop.com", subject: "Invoice", body: "hi" },
      { offline: false, config: { gmail: { refresh: "rt", clientId: "c", clientSecret: "s", redirectBase: "https://x" } } });
    assert.equal(r.sent, true); assert.equal(r.provider, "gmail");
    assert.ok(calls.some((u) => u.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")));
  } finally { globalThis.fetch = orig; }
}

console.log("✓ oauth");
