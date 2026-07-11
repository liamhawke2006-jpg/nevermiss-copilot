// AGENT MODE — approve-from-email tokens (c35). A parked action's approval email
// carries a signed, single-purpose link so the owner can approve from their phone
// without opening the console. HMAC-signed; can't be forged or reused for another
// task. (Approving still runs the SAME idempotent, gated path — the token only
// authenticates the click.)
import { createHmac, timingSafeEqual } from "node:crypto";

const secretOf = (s) => s || process.env.AGENT_APPROVE_SECRET || "dev-approve-secret-change-me";

export function approvalToken(clientId, taskId, secret) {
  const payload = `${clientId}:${taskId}`;
  const sig = createHmac("sha256", secretOf(secret)).update(payload).digest("hex").slice(0, 32);
  return `${payload}:${sig}`;
}

export function verifyApprovalToken(token, secret) {
  const parts = String(token || "").split(":");
  if (parts.length !== 3) return { valid: false };
  const [clientId, taskId, sig] = parts;
  const expect = createHmac("sha256", secretOf(secret)).update(`${clientId}:${taskId}`).digest("hex").slice(0, 32);
  let valid = false;
  try { valid = sig.length === expect.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch { valid = false; }
  return { valid, clientId, taskId: Number(taskId) };
}
