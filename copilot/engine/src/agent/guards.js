// AGENT MODE — blast-radius controls: domain allowlist, daily caps, idempotency,
// kill switch. All operate on a per-client state (see state.js) so one client's
// limits and halts never touch another's.
import { nowIso } from "./state.js";

export const DEFAULT_CAPS = {
  maxApprovalsPerDay: Number(process.env.AGENT_MAX_APPROVALS_PER_DAY || 25),
  maxEmailsPerDay: Number(process.env.AGENT_MAX_EMAILS_PER_DAY || 20),
  maxTaskRuntimeMin: Number(process.env.AGENT_MAX_TASK_MIN || 15),
};

// ---- domain allowlist --------------------------------------------------------
export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return String(url || "").toLowerCase(); }
}
// A domain is allowed if the client approved it or a parent of it (nabis.pro
// covers app.nabis.pro). The list starts empty — nothing is reachable by default.
export function isDomainAllowed(state, url) {
  const h = hostOf(url);
  return (state.allowlist || []).some((d) => h === d || h.endsWith("." + d));
}
export function approveDomain(state, domain) {
  const d = hostOf(domain.includes("://") ? domain : `https://${domain}`);
  if (d && !state.allowlist.includes(d)) state.allowlist.push(d);
  return state.allowlist;
}

// ---- daily caps --------------------------------------------------------------
function rollDay(state) {
  const today = nowIso().slice(0, 10);
  if (state.counters.day !== today) state.counters = { day: today, approvalsRequested: 0, emailsSent: 0 };
}
export function canRequestApproval(state, caps = DEFAULT_CAPS) { rollDay(state); return state.counters.approvalsRequested < caps.maxApprovalsPerDay; }
export function recordApproval(state) { rollDay(state); state.counters.approvalsRequested++; }
export function canSendEmail(state, caps = DEFAULT_CAPS) { rollDay(state); return state.counters.emailsSent < caps.maxEmailsPerDay; }
export function recordEmail(state) { rollDay(state); state.counters.emailsSent++; }
export function runtimeExceeded(startMs, nowMs, caps = DEFAULT_CAPS) { return nowMs - startMs > caps.maxTaskRuntimeMin * 60000; }

// ---- idempotency: a given send can fire AT MOST once, even on retry ----------
export function idemKey(action = {}) {
  const parts = [action.type, action.to, action.subject, action.url, action.selector, action.value].filter(Boolean).join("|");
  // tiny stable hash — no deps
  let h = 0; for (let i = 0; i < parts.length; i++) { h = (h * 31 + parts.charCodeAt(i)) | 0; }
  return `${action.type || "act"}:${h}`;
}
export function alreadyFired(state, key) { return (state.idempotency || []).includes(key); }
export function markFired(state, key) { if (!alreadyFired(state, key)) state.idempotency.push(key); }

// ---- kill switch -------------------------------------------------------------
let GLOBAL_KILL = false;
export function engageKill(state) { state.killed = true; }
export function releaseKill(state) { state.killed = false; }
export function engageGlobalKill() { GLOBAL_KILL = true; }
export function releaseGlobalKill() { GLOBAL_KILL = false; }
export function isHalted(state) { return GLOBAL_KILL || !!(state && state.killed); }
