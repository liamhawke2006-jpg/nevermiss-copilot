// The real brain: a Claude tool-use agent loop. It reasons step by step, actually
// running READ tools and feeding results back, while every world-changing tool is
// QUEUED for human approval (never executed here). The approval gate holds even
// with the model in the driver's seat.
//
// The Anthropic client is injectable so this is unit-testable with a mock (no key,
// no network). It's only imported for real when live + a key is present.
import { decide } from "./risk.js";
import { previewOf } from "./preview.js";
import { nowIso } from "./store.js";

const MAX_STEPS = 16;
const EST = { read: 5, write: 8, delete: 8, send: 8, post: 8, pay: 8, exec: 15 };

// Anthropic tool names can't contain "." — map files.read <-> files__read.
const idToName = (id) => id.replace(/\./g, "__");
const nameToId = (n) => n.replace(/__/g, ".");

// Minimal arg schemas per tool (kept here so the tool modules stay plain).
const SCHEMAS = {
  "files.list": { dir: { type: "string", description: "directory, relative to workspace" } },
  "files.read": { file: { type: "string" } },
  "files.write": { file: { type: "string" }, content: { type: "string" } },
  "files.delete": { file: { type: "string" } },
  "shell.read": { cmd: { type: "string", description: "read-only allowlisted command" } },
  "shell.exec": { cmd: { type: "string" } },
  "http.get": { url: { type: "string" } },
  "http.post": { url: { type: "string" }, body: { type: "object" } },
  "comms.email": { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
  "comms.gmail": { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
  "comms.slack": { channel: { type: "string" }, text: { type: "string" } },
  "browser.read": { url: { type: "string" }, selector: { type: "string" } },
  "browser.act": { action: { type: "string" }, selector: { type: "string" }, value: { type: "string" } },
  "desktop.observe": {},
  "desktop.act": { action: { type: "string" } },
};

function toolSpecs(registry) {
  return registry.list().map((t) => ({
    name: idToName(t.id),
    description: `${t.description}. Risk: ${t.risk}${t.risk === "read" ? " (runs immediately)" : " (HELD for human approval)"}.`,
    input_schema: { type: "object", properties: SCHEMAS[t.id] || {}, required: [] },
  }));
}

const SYSTEM = (workspace, autonomy) =>
  `You are NeverMiss Copilot, an agent that completes a business task by calling tools.
Rules:
- Files and shell operate inside the workspace "${workspace}" only.
- READ tools (list/read/fetch/observe) run immediately and return real results — use them to gather what you need.
- WORLD-CHANGING tools (write, delete, send, post, pay, exec) are NOT run by you. When you call one it is QUEUED for a human to approve; you'll get back {queued_for_approval:true}. Treat it as pending and keep going.
- Policy: ${autonomy}. Do the task with as few actions as possible, then give a one-line summary and stop.`;

async function getClient(config) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: config.anthropic.key });
}

export async function runAgent(store, taskId, { config, registry, client }) {
  const task = store.get("tasks", taskId);
  store.update("tasks", taskId, { status: "running" });
  const ctx = { config, store, workspace: config.workspace, offline: config.offline };
  const ai = client || (await getClient(config));
  const tools = toolSpecs(registry);

  const messages = [{ role: "user", content: task.prompt }];
  let done = 0, held = 0, errors = 0, seq = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ai.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: SYSTEM(config.workspace, config.autonomy),
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });
    const uses = (res.content || []).filter((b) => b.type === "tool_use");
    if (!uses.length) break; // model is done talking

    const results = [];
    for (const u of uses) {
      seq++;
      const id = nameToId(u.name);
      const tool = registry.get(id);
      if (!tool) {
        const blocked = registry.isKnownButDisabled(id);
        store.insert("steps", { task_id: taskId, seq, tool: id, args: u.input, risk: "?", decision: blocked ? "blocked" : "error", status: blocked ? "blocked" : "error", why: "", est: 0, result: { error: blocked ? "capability disabled" : "unknown tool" }, ts: nowIso() });
        store.event(taskId, blocked ? "blocked" : "error", blocked ? `Blocked — ${id} capability is off` : `Unknown tool ${id}`);
        if (!blocked) errors++;
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ error: blocked ? "capability disabled" : "unknown tool" }) });
        continue;
      }
      const why = summarize(id, u.input);
      if (decide(tool.risk, config.autonomy) === "auto") {
        try {
          const result = await tool.run(u.input, ctx);
          store.insert("steps", { task_id: taskId, seq, tool: id, args: u.input, risk: tool.risk, decision: "auto", status: "done", why, est: EST[tool.risk] || 5, result, ts: nowIso() });
          store.event(taskId, "step_done", `${id}: ${why}`);
          done++;
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result).slice(0, 3000) });
        } catch (e) {
          store.insert("steps", { task_id: taskId, seq, tool: id, args: u.input, risk: tool.risk, decision: "auto", status: "error", why, est: 0, result: { error: e.message }, ts: nowIso() });
          store.event(taskId, "error", `${id} failed: ${e.message}`);
          errors++;
          results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ error: e.message }) });
        }
      } else {
        const stepRow = store.insert("steps", { task_id: taskId, seq, tool: id, args: u.input, risk: tool.risk, decision: "hold", status: "held", why, est: EST[tool.risk] || 5, result: null, ts: nowIso() });
        store.insert("held", { task_id: taskId, step_id: stepRow.id, tool: id, args: u.input, risk: tool.risk, preview: previewOf(id, u.input), why, status: "pending", created_at: nowIso(), resolved_at: null, result: null });
        store.event(taskId, "held", `HELD for approval — ${id} (${tool.risk}): ${previewOf(id, u.input)}`, { risk: tool.risk });
        held++;
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify({ queued_for_approval: true, note: "Held for human approval; treat as pending and continue." }) });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const status = held > 0 ? "awaiting_approval" : errors > 0 ? "failed" : "done";
  store.update("tasks", taskId, { status, done_at: status === "done" ? nowIso() : null });
  store.event(taskId, status, `Task ${status.replace(/_/g, " ")} — ${done} ran, ${held} held, ${errors} error(s)`);
  return { taskId, status, done, held, errors };
}

function summarize(id, args) {
  if (id === "files.read" || id === "files.list") return `Read ${args.file || args.dir || "workspace"}`;
  if (id === "http.get") return `Fetch ${args.url}`;
  return previewOf(id, args);
}
