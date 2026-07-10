// The engine. assign() queues a task; run() plans it and executes: safe steps run
// immediately, world-changing steps become HELD actions that never run until a
// human approves. This is the whole safety contract.
import { decide } from "./risk.js";
import { planTask } from "./planner.js";
import { previewOf } from "./preview.js";
import { runAgent } from "./agent.js";
import { nowIso } from "./store.js";

export function assign(store, prompt) {
  const task = store.insert("tasks", { prompt, status: "assigned", created_at: nowIso(), done_at: null });
  store.event(task.id, "assigned", `Assigned: ${prompt}`);
  return task;
}

export async function run(store, taskId, { config, registry, client }) {
  const task = store.get("tasks", taskId);
  if (!task) throw new Error(`no task ${taskId}`);

  // Live: the real Claude tool-use agent understands and executes open-ended tasks.
  // Offline (or no key): the deterministic heuristic planner (demo/tests).
  if (client || (!config.offline && config.anthropic.key)) {
    return runAgent(store, taskId, { config, registry, client });
  }

  store.update("tasks", taskId, { status: "running" });

  const plan = planTask(task.prompt, registry, config);
  const ctx = { config, store, workspace: config.workspace, offline: config.offline };
  let done = 0, held = 0, errors = 0, seq = 0;

  for (const step of plan.steps) {
    seq++;
    const tool = registry.get(step.tool);
    if (!tool) {
      const blocked = registry.isKnownButDisabled(step.tool);
      store.insert("steps", { task_id: taskId, seq, tool: step.tool, args: step.args, risk: "?", decision: blocked ? "blocked" : "error", status: blocked ? "blocked" : "error", why: step.why, est: 0, result: { error: blocked ? "capability disabled" : "unknown tool" }, ts: nowIso() });
      store.event(taskId, blocked ? "blocked" : "error", blocked ? `Blocked — ${step.tool} capability is off` : `Unknown tool ${step.tool}`);
      if (!blocked) errors++;
      continue;
    }
    const decision = decide(tool.risk, config.autonomy);
    if (decision === "auto") {
      try {
        const result = await tool.run(step.args, ctx);
        store.insert("steps", { task_id: taskId, seq, tool: tool.id, args: step.args, risk: tool.risk, decision: "auto", status: "done", why: step.why, est: step.est, result, ts: nowIso() });
        store.event(taskId, "step_done", `${tool.id}: ${step.why}`);
        done++;
      } catch (e) {
        store.insert("steps", { task_id: taskId, seq, tool: tool.id, args: step.args, risk: tool.risk, decision: "auto", status: "error", why: step.why, est: 0, result: { error: e.message }, ts: nowIso() });
        store.event(taskId, "error", `${tool.id} failed: ${e.message}`);
        errors++;
      }
    } else {
      const stepRow = store.insert("steps", { task_id: taskId, seq, tool: tool.id, args: step.args, risk: tool.risk, decision: "hold", status: "held", why: step.why, est: step.est, result: null, ts: nowIso() });
      store.insert("held", { task_id: taskId, step_id: stepRow.id, tool: tool.id, args: step.args, risk: tool.risk, preview: previewOf(tool.id, step.args), why: step.why, status: "pending", created_at: nowIso(), resolved_at: null, result: null });
      store.event(taskId, "held", `HELD for approval — ${tool.id} (${tool.risk}): ${previewOf(tool.id, step.args)}`, { risk: tool.risk });
      held++;
    }
  }

  const status = held > 0 ? "awaiting_approval" : errors > 0 ? "failed" : "done";
  store.update("tasks", taskId, { status, done_at: status === "done" ? nowIso() : null });
  store.event(taskId, status, `Task ${status.replace(/_/g, " ")} — ${done} done, ${held} held, ${errors} error(s)`);
  return { taskId, status, done, held, errors, plan };
}
