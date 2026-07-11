// Upgrade 1 — audit trail. A chronological, read-only record of every consequential
// decision, derived from the append-only event log. One place to answer "what did
// Copilot do, what did a human approve/deny, and when."
import { redact } from "./redact.js";

const AUDIT_TYPES = new Set([
  "assigned", "held", "approved", "denied", "expired", "blocked_rate", "error", "done", "failed",
]);

export function auditLog(store, { taskId = null, limit = 200 } = {}) {
  return store
    .all("events")
    .filter((e) => AUDIT_TYPES.has(e.type) && (taskId == null || e.task_id === taskId))
    .slice(-limit)
    .map((e) => ({ id: e.id, ts: e.ts, task_id: e.task_id, type: e.type, summary: redact(e.summary), meta: redact(e.meta || {}) }));
}
