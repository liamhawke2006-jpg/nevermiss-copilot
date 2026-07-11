// The human gate. approve() runs a held action for real; deny() cancels it. A
// held action is the ONLY way a world-changing tool ever executes.
import { nowIso } from "./store.js";
import { humanize } from "./errors.js";

// Risks that "leave the building" or cost money — subject to the daily cap (U4).
const CAP_RISKS = new Set(["send", "post", "pay"]);

function reconcile(store, taskId) {
  const pending = store.where("held", (h) => h.task_id === taskId && (h.status === "pending" || h.status === "executing"));
  if (pending.length) return;
  const steps = store.where("steps", (s) => s.task_id === taskId);
  const anyError = steps.some((s) => s.status === "error");
  const status = anyError ? "failed" : "done";
  store.update("tasks", taskId, { status, done_at: nowIso() });
  store.event(taskId, status, `Task ${status} — all held actions resolved`);
}

function sentToday(store) {
  const today = nowIso().slice(0, 10);
  return store.where("held", (h) => h.status === "executed" && CAP_RISKS.has(h.risk) && String(h.resolved_at || "").slice(0, 10) === today).length;
}

export async function approve(store, heldId, { config, registry }) {
  const h = store.get("held", heldId);
  if (!h || h.status !== "pending") throw new Error(`no pending held action ${heldId}`);

  // U4 — daily send cap (runaway guard). 0 = unlimited.
  const cap = (config && config.maxSendsPerDay) || 0;
  if (cap > 0 && CAP_RISKS.has(h.risk) && sentToday(store) >= cap) {
    const msg = `daily send cap (${cap}) reached — nothing sent`;
    store.update("held", heldId, { status: "blocked_rate", resolved_at: nowIso(), result: { error: msg } });
    store.update("steps", h.step_id, { status: "error", result: { error: msg } });
    store.event(h.task_id, "blocked_rate", `Blocked — ${msg}; ${h.tool}: ${h.preview}`, { risk: h.risk });
    reconcile(store, h.task_id);
    return store.get("held", heldId);
  }

  // U6 — idempotency: flip to 'executing' synchronously BEFORE the await, so a
  // duplicate approve (double-click / retry) sees a non-pending action above and
  // throws — a world-changing action can never fire twice.
  store.update("held", heldId, { status: "executing", resolved_at: nowIso() });

  const tool = registry.get(h.tool);
  const ctx = { config, store, workspace: config.workspace, offline: config.offline };
  try {
    if (!tool) throw new Error("capability disabled");
    const result = await tool.run(h.args, ctx);
    store.update("held", heldId, { status: "executed", result });
    store.update("steps", h.step_id, { status: "done", result });
    store.event(h.task_id, "approved", `Approved & executed — ${h.tool}: ${h.preview}`, { risk: h.risk, simulated: !!(result && result.simulated) });
  } catch (e) {
    const friendly = humanize(e.message); // U8 — actionable message
    store.update("held", heldId, { status: "error", result: { error: friendly, raw: e.message } });
    store.update("steps", h.step_id, { status: "error", result: { error: friendly } });
    store.event(h.task_id, "error", `Approved action failed — ${h.tool}: ${friendly}`, { risk: h.risk });
  }
  reconcile(store, h.task_id);
  return store.get("held", heldId);
}

export function deny(store, heldId, reason = "") {
  const h = store.get("held", heldId);
  if (!h || h.status !== "pending") throw new Error(`no pending held action ${heldId}`);
  const r = String(reason || "").slice(0, 200);
  store.update("held", heldId, { status: "denied", resolved_at: nowIso(), reason: r });
  store.update("steps", h.step_id, { status: "denied" });
  store.event(h.task_id, "denied", `Denied — ${h.tool}: ${h.preview}${r ? ` — reason: ${r}` : ""}`, { risk: h.risk, reason: r });
  reconcile(store, h.task_id);
  return store.get("held", heldId);
}

// U3 — held actions unresolved past a TTL are auto-expired (never executed). A
// forgotten world-changing action must not stay approvable days later.
export function expireStale(store, maxAgeMin, nowMs = Date.now()) {
  if (!maxAgeMin || maxAgeMin <= 0) return [];
  const cutoff = nowMs - maxAgeMin * 60000;
  const stale = store.where("held", (h) => h.status === "pending" && parseTs(h.created_at) < cutoff);
  for (const h of stale) {
    store.update("held", h.id, { status: "expired", resolved_at: nowIso() });
    store.update("steps", h.step_id, { status: "expired" });
    store.event(h.task_id, "expired", `Expired (unapproved > ${maxAgeMin}m) — ${h.tool}: ${h.preview}`, { risk: h.risk });
    reconcile(store, h.task_id);
  }
  return stale.map((h) => h.id);
}
function parseTs(s) { return Date.parse(String(s).replace(" ", "T") + "Z") || 0; }

export function pending(store) {
  return store.where("held", (h) => h.status === "pending");
}
