// Encrypt tenant secrets at rest. The key lives in the environment
// (COPILOT_SECRET_KEY), never on disk — so data/tenants.json holds only
// AES-256-GCM ciphertext. In dev (no key) it falls back to plaintext with the
// understanding that production must set the key.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const keyStr = () => process.env.COPILOT_SECRET_KEY || "";
const keyBuf = () => scryptSync(keyStr(), "copilot-secrets-v1", 32);

export function hasKey() { return !!keyStr(); }

export function seal(obj) {
  if (!keyStr()) return obj; // dev fallback (documented; set the key in prod)
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBuf(), iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), "utf8")), c.final()]);
  return { enc: true, v: Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64") };
}

export function open(stored) {
  if (!stored || !stored.enc) return stored || {};
  if (!keyStr()) throw new Error("COPILOT_SECRET_KEY required to read encrypted secrets");
  const raw = Buffer.from(stored.v, "base64");
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
  const d = createDecipheriv("aes-256-gcm", keyBuf(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
}
