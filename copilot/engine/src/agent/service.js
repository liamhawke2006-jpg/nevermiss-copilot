// AGENT MODE — service layer. Ties per-client state + the gated task loop + session
// persistence into one API the server (and tests) call. The browser and planner are
// INJECTED: production passes the real Playwright adapter + Claude planner; tests
// pass fakes. Nothing here relaxes a gate — it orchestrates the gated primitives.
import { newClientState } from "./state.js";
import { runTask, performApproved } from "./loop.js";
import { engageKill, releaseKill, engageGlobalKill, approveDomain, isHalted, hostOf, DEFAULT_CAPS } from "./guards.js";
import { prune } from "./audit.js";
import { makePlanner } from "./planner.js";
import * as realBrowser from "./browser.js";
import { makeOpenPage, closeClient, closeAll } from "./pagepool.js";
import { raiseAlerts } from "./alerts.js";
import { previewPlan } from "./plan.js";
import { buildReplay, exportSession } from "./replay.js";
import { makeVerifier } from "./verifier.js";
import { trustScore } from "./trustscore.js";
import { weeklyAgentDigest } from "./agentdigest.js";
import { redTeamReport } from "./redteam.js";

// createAgentService deps:
//   store    — JSON store (store.js); uses `agentClients` + `agentSessions` collections.
//   config   — resolved tenant/engine config (offline, anthropic, browserHeadless).
//   browser  — object with observe(page)/act(page,action). Default: the Playwright
//              module (LIVE-gated). Tests inject a fake.
//   planner  — planner(ctx)->action. Default: makePlanner(config).
//   openPage — (state)->page. Default: launch the client's isolated Playwright profile.
export function createAgentService({ store, config = {}, browser = realBrowser, planner, openPage, caps = DEFAULT_CAPS, alertNotify, verifier }) {
  const plan = planner || makePlanner(config);
  const verify = verifier || makeVerifier(config); // second-model review of Tier-2 actions
  const open = openPage || makeOpenPage(config); // production: pooled per-client browser
  const inflight = new Set(); // per-client single-flight: one task at a time per client

  function stateFor(clientId) {
    let row = store.where("agentClients", (c) => c.clientId === String(clientId))[0];
    if (!row) row = store.insert("agentClients", { ...newClientState(clientId) });
    return row; // the stored object; guards mutate it in place
  }
  const persist = (state) => store.update("agentClients", state.id, state);

  const launch = (state) => open(state);

  // Assign a plain-English task. Runs the gated loop; persists the recorded session.
  async function assign(clientId, prompt, { now = () => Date.now() } = {}) {
    const cid = String(clientId);
    const state = stateFor(cid);
    if (isHalted(state)) return { status: "halted", reason: "kill switch engaged for this client" };
    if (inflight.has(cid)) return { status: "busy", reason: "a task is already running for this client — one at a time" };
    inflight.add(cid);
    try {
      let page;
      try { page = await launch(state); }
      catch (e) { return { status: "browser_unavailable", reason: e.message }; } // LIVE-gated until Playwright is wired
      const row = store.insert("agentSessions", { clientId: cid, assignment: prompt, status: "running", startedAt: iso(now()) });
      const res = await runTask({ state, assignment: prompt, planner: plan, browser, page, caps, taskId: row.id, startMs: now(), now, verifier: verify, memory: state.notes || [], askFirst: true });
      // c21 — a task that wanted a new domain surfaces it for one-click approval.
      if (res.status === "parked_domain" && res.domain && !(state.pendingDomains || []).includes(res.domain)) (state.pendingDomains = state.pendingDomains || []).push(res.domain);
      store.update("agentSessions", row.id, { ...res.session, status: res.status, held: res.held || null, blocked: res.blocked || null, injection: res.injection || null, question: res.question || null });
      persist(state);
      const alerts = await raiseAlerts({ ...res.session, taskId: row.id }, { config, store, notify: alertNotify }); // operator alerts
      return { taskId: row.id, ...res, alerts };
    } finally { inflight.delete(cid); }
  }

  // Approve the parked Tier-2 action of a session — fires it ONCE (idempotent).
  async function approve(clientId, taskId) {
    const state = stateFor(clientId);
    const s = store.get("agentSessions", Number(taskId));
    if (!s || !s.held) return { status: "no_parked_action" };
    const page = await launch(state).catch(() => null);
    const r = await performApproved(state, page, browser, s.held.action, caps);
    store.update("agentSessions", Number(taskId), { status: r.executed ? "done" : s.status, approvedResult: r });
    persist(state);
    return r;
  }
  function deny(clientId, taskId, reason = "") {
    const s = store.get("agentSessions", Number(taskId));
    if (s) store.update("agentSessions", Number(taskId), { status: "denied", denyReason: String(reason).slice(0, 200) });
    return { status: "denied" };
  }

  function kill(clientId) { const st = stateFor(clientId); engageKill(st); persist(st); closeClient(clientId).catch(() => {}); return { killed: true }; }
  function unkill(clientId) { const st = stateFor(clientId); releaseKill(st); persist(st); return { killed: false }; }
  function killGlobal() { engageGlobalKill(); closeAll().catch(() => {}); return { globalKill: true }; }
  function allowDomain(clientId, domain) {
    const st = stateFor(clientId); approveDomain(st, domain);
    const h = hostOf(domain.includes("://") ? domain : `https://${domain}`);
    st.pendingDomains = (st.pendingDomains || []).filter((d) => d !== h && d !== domain); // c21: clear the pending request
    persist(st); return { allowlist: st.allowlist, pendingDomains: st.pendingDomains };
  }
  const pendingDomains = (clientId) => stateFor(clientId).pendingDomains || [];
  // c22 — client memory: standing preferences the agent carries into every task.
  function addNote(clientId, note) { const st = stateFor(clientId); const n = String(note || "").slice(0, 200); if (n) (st.notes = st.notes || []).push(n); persist(st); return { notes: st.notes }; }
  const notes = (clientId) => stateFor(clientId).notes || [];

  function sessions(clientId) { return prune(store.where("agentSessions", (s) => s.clientId === String(clientId))); }
  function session(taskId) { return store.get("agentSessions", Number(taskId)); }
  function clientView(clientId) { const st = stateFor(clientId); return { clientId: st.clientId, allowlist: st.allowlist, killed: st.killed, counters: st.counters, profileDir: st.profileDir }; }

  // Safety-posture snapshot for a client (drives the trust report card).
  function stats(clientId) {
    const ss = store.where("agentSessions", (s) => s.clientId === String(clientId));
    const steps = ss.flatMap((s) => s.steps || []);
    const byStatus = {};
    for (const s of ss) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const st = stateFor(clientId);
    return {
      clientId: String(clientId),
      tasks: ss.length,
      byStatus,
      autoActions: steps.filter((x) => x.decision === "auto").length,
      approvalsRequested: ss.filter((s) => s.status === "parked_approval").length,
      tier3Blocked: steps.filter((x) => x.decision === "blocked").length,
      injectionFreezes: ss.filter((s) => s.status === "frozen").length,
      piiRedactions: steps.filter((x) => x.event === "pii_redacted").length,
      domainsTouched: [...new Set(steps.map((x) => x.action && x.action.url && hostOf(x.action.url)).filter(Boolean))],
      allowlist: st.allowlist,
      killed: st.killed,
    };
  }

  const preview = (assignment) => previewPlan(assignment); // Plan Preview & Trust Map (no execution)
  const reportCard = (clientId) => trustScore(stats(clientId)); // c11
  const digest = (clientId) => weeklyAgentDigest(sessions(clientId), String(clientId)); // c12
  // c25 — rough LLM cost estimate (planner + verifier calls). Offline shows the projection.
  const estCostUsd = (st) => Math.round(((st.autoActions || 0) + (st.approvalsRequested || 0) * 2) * 0.0009 * 1000) / 1000;

  // FLAGSHIP c30 — Trust Dashboard: everything the owner's control room needs, in one payload.
  function dashboard(clientId) {
    const st = stats(clientId);
    return {
      clientId: String(clientId),
      trust: trustScore(st),
      stats: st,
      digest: weeklyAgentDigest(sessions(clientId), String(clientId)),
      recent: sessions(clientId).slice(-6).reverse().map((s) => ({ taskId: s.id, assignment: s.assignment, status: s.status, startedAt: s.startedAt, steps: (s.steps || []).length })),
      alerts: store.where("events", (e) => e.type === "agent_alert").slice(-10).reverse(),
      redteam: redTeamReport(),
      allowlist: stateFor(clientId).allowlist,
      pendingDomains: pendingDomains(clientId),
      notes: notes(clientId),
      estCostUsd: estCostUsd(st),
    };
  }

  // c13 — dry-run a task against saved page observations. No browser, no persistence:
  // uses a disposable copy of the client's allowlist so nothing is mutated.
  async function simulate(clientId, assignment, observations = []) {
    const real = stateFor(clientId);
    const sandbox = { ...newClientState(clientId), allowlist: [...(real.allowlist || [])] };
    let i = 0;
    const browser = { observe: async () => observations[Math.min(i++, observations.length - 1)] || { url: "", text: "", html: "" }, act: async () => {} };
    return runTask({ state: sandbox, assignment, planner: plan, browser, page: {}, caps, taskId: 0, startMs: 1, now: () => 2, verifier: verify });
  }
  const replay = (taskId) => buildReplay(session(taskId) || {});  // HTML timeline
  const exportOne = (taskId) => exportSession(session(taskId) || {}); // portable JSON

  return { assign, approve, deny, kill, unkill, killGlobal, allowDomain, pendingDomains, addNote, notes, sessions, session, clientView, stats, preview, replay, exportOne, reportCard, digest, simulate, dashboard, stateFor };
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
