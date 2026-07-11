// AGENT MODE — session audit. Every task is a fully recorded session: timestamped
// actions + screenshots + gate decisions, so the client can replay any task like a
// security camera. Retained 90 days.
import { nowIso } from "./state.js";
import { redact } from "../redact.js";

export function newSession(clientId, taskId, assignment) {
  return { clientId: String(clientId), taskId, assignment: redact(assignment), startedAt: nowIso(), status: "running", steps: [] };
}

export function record(session, entry) {
  session.steps.push({ n: session.steps.length + 1, ts: nowIso(), ...redactEntry(entry) });
  return session;
}

function redactEntry(e = {}) {
  const out = { ...e };
  if (out.action) out.action = redact(out.action);
  if (out.note) out.note = redact(out.note);
  return out;
}

// 90-day retention sweep. Keeps sessions whose start is within the window.
export function prune(sessions, { days = 90, nowMs = Date.now() } = {}) {
  const cutoff = nowMs - days * 86400000;
  return sessions.filter((s) => (Date.parse(String(s.startedAt).replace(" ", "T") + "Z") || 0) >= cutoff);
}
