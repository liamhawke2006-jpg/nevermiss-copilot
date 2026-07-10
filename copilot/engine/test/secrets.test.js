// Secrets are encrypted at rest with a key from the environment.
import assert from "node:assert/strict";

process.env.COPILOT_SECRET_KEY = "test-master-key";
const { seal, open, hasKey } = await import("../src/secrets.js");

assert.equal(hasKey(), true);
const blob = seal({ sendgridKey: "SG.secret", gmailRefresh: "refresh-tok" });
assert.equal(blob.enc, true);
assert.doesNotMatch(JSON.stringify(blob), /SG\.secret/, "ciphertext hides the secret");
assert.doesNotMatch(JSON.stringify(blob), /refresh-tok/);

const back = open(blob);
assert.equal(back.sendgridKey, "SG.secret");
assert.equal(back.gmailRefresh, "refresh-tok");

// wrong key can't decrypt
process.env.COPILOT_SECRET_KEY = "wrong-key";
assert.throws(() => open(blob));

// no key → plaintext passthrough (dev), and open() returns it unchanged
delete process.env.COPILOT_SECRET_KEY;
const pt = seal({ a: 1 });
assert.deepEqual(pt, { a: 1 });
assert.deepEqual(open(pt), { a: 1 });

console.log("✓ secrets");
