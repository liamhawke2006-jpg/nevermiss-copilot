// The human gate. approve() runs a held action for real; deny() cancels it. A
// held action is the ONLY way a world-changing tool ever executes.
import { nowIso } from "./store.js";

function reconcile(store, taskId) {
  const pending = store.where("held", (h) => h.task_id === taskId && h.status === "pending");
  if (pending.length) return;
  const steps = store.where("steps", (s) => s.task_id === taskId);
  const anyError = steps.some((s) => s.status === "error");
  const status = anyError ? "failed" : "done";
  store.update("tasks", taskId, { status, done_at: nowIso() });
  store.event(taskId, status, `Task ${status} — all held actions resolved`);
}

export async function approve(store, heldId, { config, registry }) {
  const h = store.get("held", heldId);
  if (!h || h.status !== "pending") throw new Error(`no pending held action ${heldId}`);
  const tool = registry.get(h.tool);
  const ctx = { config, store, workspace: config.workspace, offline: config.offline };
  try {
    const result = await tool.run(h.args, ctx);
    store.update("held", heldId, { status: "executed", resolved_at: nowIso(), result });
    store.update("steps", h.step_id, { status: "done", result });
    store.event(h.task_id, "approved", `Approved & executed — ${h.tool}: ${h.preview}`);
  } catch (e) {
    store.update("held", heldId, { status: "error", resolved_at: nowIso(), result: { error: e.message } });
    store.update("steps", h.step_id, { status: "error", result: { error: e.message } });
    store.event(h.task_id, "error", `Approved action failed — ${h.tool}: ${e.message}`);
  }
  reconcile(store, h.task_id);
  return store.get("held", heldId);
}

export function deny(store, heldId) {
  const h = store.get("held", heldId);
  if (!h || h.status !== "pending") throw new Error(`no pending held action ${heldId}`);
  store.update("held", heldId, { status: "denied", resolved_at: nowIso() });
  store.update("steps", h.step_id, { status: "denied" });
  store.event(h.task_id, "denied", `Denied — ${h.tool}: ${h.preview}`);
  reconcile(store, h.task_id);
  return store.get("held", heldId);
}

export function pending(store) {
  return store.where("held", (h) => h.status === "pending");
}
