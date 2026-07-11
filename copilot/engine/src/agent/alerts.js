// AGENT MODE — anomaly alerts to the operator (Liam). Fires on the signals that
// mean "look at this task now": repeated Tier-3 attempts, an injection freeze, or a
// task touching a sensitive (banking/legal/health) domain. Derived from the recorded
// session (audit) so it's a pure function of what actually happened.
import { domainCategory, SENSITIVE_CATEGORIES } from "./domains.js";
import { hostOf } from "./guards.js";

export function detectAnomalies(session, { knownDomains = [] } = {}) {
  const steps = session.steps || [];
  const alerts = [];

  const tier3 = steps.filter((s) => s.decision === "blocked").length;
  if (tier3 >= 2) alerts.push({ type: "repeated_tier3", severity: "high", detail: `${tier3} Tier-3 attempts in one task`, taskId: session.taskId });

  if (steps.some((s) => s.event === "injection_freeze") || session.status === "frozen")
    alerts.push({ type: "prompt_injection", severity: "high", detail: "task frozen on a poisoned page", taskId: session.taskId });

  // New sensitive-category domain the client hasn't used before.
  for (const s of steps) {
    const url = s.action && (s.action.url || "");
    if (!url) continue;
    const cat = domainCategory(url);
    const host = hostOf(url);
    if (SENSITIVE_CATEGORIES.has(cat) && !knownDomains.includes(host))
      alerts.push({ type: "new_sensitive_domain", severity: "medium", detail: `first ${cat} domain: ${host}`, taskId: session.taskId });
  }
  return alerts;
}

// Raise alerts: emit an event + (optionally) email the operator. notify is injected
// so tests don't send mail; production passes an email sender.
export async function raiseAlerts(session, { config = {}, store, notify } = {}) {
  const known = store ? [...new Set(store.all("agentSessions").flatMap((s) => (s.steps || []).map((x) => x.action && x.action.url && hostOf(x.action.url)).filter(Boolean)))] : [];
  const alerts = detectAnomalies(session, { knownDomains: known });
  for (const a of alerts) {
    if (store) store.event(session.taskId, "agent_alert", `⚠ ${a.type} — ${a.detail}`, a);
    if (notify) await notify(a);
  }
  return alerts;
}
