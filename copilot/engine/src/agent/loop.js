// AGENT MODE — the task loop. Plain-English assignment → observe → injection scan →
// plan → CLASSIFY IN CODE → execute (Tier 1) / park for approval (Tier 2) / refuse
// (Tier 3). The planner (Claude) and the browser are INJECTED, so the whole trust
// path is testable without a live model or a real browser.
import { classify, TIER } from "./classify.js";
import { scanInjection, destinationFromContent } from "./injection.js";
import { shieldPII } from "./pii.js";
import { explainAction } from "./explain.js";
import { isDomainAllowed, hostOf, isHalted, canRequestApproval, canSendEmail, recordApproval, recordEmail, idemKey, alreadyFired, markFired, runtimeExceeded, DEFAULT_CAPS } from "./guards.js";
import { newSession, record } from "./audit.js";

const isEmail = (a) => a && (a.type === "send_email" || (a.type === "send" && a.to));

// One-action gate used everywhere. Never executes — decides the tier + whether an
// AUTO action is clear to run. The planning model cannot bypass this.
export function guard(state, action, caps = DEFAULT_CAPS) {
  if (isHalted(state)) return { tier: null, decision: "halted", executed: false, reason: "kill switch engaged" };
  const g = classify(action);
  if (g.tier === TIER.BLOCK) return { ...g, decision: "blocked", executed: false, handoff: true };
  if (g.tier === TIER.HOLD) {
    if (!canRequestApproval(state, caps)) return { ...g, decision: "cap_reached", executed: false };
    return { ...g, decision: "hold", executed: false };
  }
  return { ...g, decision: "auto", executed: false };
}

// Run a Tier-1 action (only). Anything else returns without touching the browser.
export async function performAuto(state, page, browser, action, caps = DEFAULT_CAPS) {
  const g = guard(state, action, caps);
  if (g.decision !== "auto") return g;
  await browser.act(page, action);
  return { ...g, executed: true };
}

// The ONLY path that fires a Tier-2 action — after a human approved THIS exact
// action. Idempotent (a given send can fire at most once) and cap-enforced. Still
// refuses Tier 3 and obeys the kill switch even here.
export async function performApproved(state, page, browser, action, caps = DEFAULT_CAPS) {
  if (isHalted(state)) return { decision: "halted", executed: false };
  if (classify(action).tier === TIER.BLOCK) return { decision: "blocked", executed: false };
  const key = idemKey(action);
  if (alreadyFired(state, key)) return { decision: "duplicate", executed: false }; // double-fire impossible
  if (isEmail(action) && !canSendEmail(state, caps)) return { decision: "cap_reached", executed: false };
  markFired(state, key);
  recordApproval(state);
  if (isEmail(action)) recordEmail(state);
  await browser.act(page, action);
  return { decision: "executed", executed: true };
}

// The full loop. Returns the session (audit) + a terminal status:
//   done | frozen (injection) | parked_approval | parked_domain | parked_timeout | halted | blocked_handoff
export async function runTask({ state, assignment, planner, browser, page, caps = DEFAULT_CAPS, taskId = 0, startMs = 0, now = () => Date.now(), maxSteps = 24, verifier = null }) {
  const t0 = startMs || now();
  const session = newSession(state.clientId, taskId, assignment);
  const finish = (status, extra = {}) => { session.status = status; session.endedAt = new Date(now()).toISOString().slice(0, 19).replace("T", " "); return { ...extra, session, status }; };

  for (let i = 0; i < maxSteps; i++) {
    if (isHalted(state)) { record(session, { event: "halt" }); return finish("halted"); }
    if (runtimeExceeded(t0, now(), caps)) { record(session, { event: "timeout" }); return finish("parked_timeout"); }

    const obs = await browser.observe(page);

    // INJECTION DEFENSE — scan extracted content BEFORE it reaches the planner.
    const inj = scanInjection(obs.text, obs.html);
    if (inj.flagged) {
      record(session, { event: "injection_freeze", reasons: inj.reasons, evidence: inj.evidence, screenshot: obs.screenshot });
      return finish("frozen", { injection: inj });
    }

    // Plan the next action. Page content is passed as DATA only, and PII is
    // redacted before the model ever sees it.
    const shield = shieldPII(obs.text);
    if (shield.redactions) record(session, { event: "pii_redacted", note: `${shield.redactions} PII value(s) hidden from the model`, kinds: shield.kinds });
    const action = await planner({ assignment, observation: { url: obs.url, text: shield.text, axtree: obs.axtree }, history: session.steps });
    if (!action || action.type === "done") { record(session, { event: "done" }); return finish("done"); }

    // Domain allowlist + content-sourced destination (goals come only from the assignment).
    if ((action.type === "navigate" || action.type === "goto") && action.url) {
      if (!isDomainAllowed(state, action.url)) {
        record(session, { action, event: "domain_not_allowed", note: hostOf(action.url), screenshot: obs.screenshot });
        return finish("parked_domain", { domain: hostOf(action.url) });
      }
      if (destinationFromContent(action.url, assignment)) {
        record(session, { action, event: "content_sourced_destination", tier: 2, decision: "hold", screenshot: obs.screenshot });
        return finish("parked_approval", { held: { action, reason: "destination came from page content — approve before navigating", screenshot: obs.screenshot } });
      }
    }

    const g = guard(state, action, caps);
    if (g.decision === "halted") { record(session, { event: "halt" }); return finish("halted"); }
    if (g.decision === "blocked") {
      record(session, { action, tier: 3, decision: "blocked", reason: g.reason, screenshot: obs.screenshot });
      return finish("blocked_handoff", { blocked: { action, reason: g.reason, explain: explainAction(action) } }); // hand this part to the client
    }
    if (g.decision === "cap_reached") { record(session, { action, decision: "cap_reached", reason: "daily approval cap" }); return finish("parked_timeout", { cap: true }); }
    if (g.decision === "hold") {
      // Adversarial verifier (defense in depth): a second model tries to REFUTE this
      // action before it can even reach the approval card. Refuted → handed to the
      // client, never offered as a one-tap.
      if (verifier) {
        const v = await verifier({ assignment, action });
        if (v.refuted) {
          record(session, { action, tier: 2, decision: "verifier_refused", reason: v.reason, screenshot: obs.screenshot });
          return finish("blocked_handoff", { blocked: { action, reason: `Second-model review flagged this: ${v.reason}`, explain: explainAction(action) } });
        }
        record(session, { event: "verifier_ok", note: v.reason });
      }
      // Park with the EXACT payload the client will see before anything fires.
      record(session, { action, tier: 2, decision: "hold", reason: g.reason, verified: !!verifier, screenshot: obs.screenshot });
      return finish("parked_approval", { held: { action, reason: g.reason, explain: explainAction(action), verified: !!verifier, screenshot: obs.screenshot } });
    }
    // Tier 1 — run it and record.
    await browser.act(page, action);
    record(session, { action, tier: 1, decision: "auto", screenshot: obs.screenshot });
  }
  record(session, { event: "max_steps" });
  return finish("parked_timeout", { maxSteps: true });
}
