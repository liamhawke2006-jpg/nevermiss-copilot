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

// createAgentService deps:
//   store    — JSON store (store.js); uses `agentClients` + `agentSessions` collections.
//   config   — resolved tenant/engine config (offline, anthropic, browserHeadless).
//   browser  — object with observe(page)/act(page,action). Default: the Playwright
//              module (LIVE-gated). Tests inject a fake.
//   planner  — planner(ctx)->action. Default: makePlanner(config).
//   openPage — (state)->page. Default: launch the client's isolated Playwright profile.
export function createAgentService({ store, config = {}, browser = realBrowser, planner, openPage, caps = DEFAULT_CAPS, alertNotify }) {
  const plan = planner || makePlanner(config);
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
      const res = await runTask({ state, assignment: prompt, planner: plan, browser, page, caps, taskId: row.id, startMs: now(), now });
      store.update("agentSessions", row.id, { ...res.session, status: res.status, held: res.held || null, blocked: res.blocked || null, injection: res.injection || null });
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
  function allowDomain(clientId, domain) { const st = stateFor(clientId); approveDomain(st, domain); persist(st); return { allowlist: st.allowlist }; }

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

  return { assign, approve, deny, kill, unkill, killGlobal, allowDomain, sessions, session, clientView, stats, preview, stateFor };
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
