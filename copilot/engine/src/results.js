// Aggregates the engine's state into the numbers the Copilot results console
// shows: time recovered, tasks done, actions waiting on a human.
const EST = (steps) => steps.filter((s) => s.status === "done").reduce((a, s) => a + (s.est || 0), 0);

// Maps live engine state into the exact JSON contract the Copilot console renders.
// Pending held actions become approvable feed items (carrying their heldId).
const ICON = { files: "📁", comms: "✉️", shell: "⌘", http: "🌐", browser: "🧭", desktop: "🖥️" };
const APP = { "comms.email": "Email", "comms.slack": "Slack", "shell.exec": "Shell", "shell.read": "Shell", "http.get": "HTTP", "http.post": "HTTP" };
const domainOf = (id) => id.split(".")[0];
const iconOf = (id) => ICON[domainOf(id)] || "•";
const appOf = (id) => APP[id] || domainOf(id).toUpperCase();

function trend7(store, hoursSaved) {
  const mins = store.where("steps", (x) => x.status === "done").map((x) => x.est || 0);
  if (mins.length < 2) return [0, hoursSaved || 0];
  let cum = 0;
  const pts = mins.map((m) => (cum += m) / 60);
  return Array.from({ length: 7 }, (_, i) => Number(pts[Math.floor((i * (pts.length - 1)) / 6)].toFixed(1)));
}

export function consoleView(store) {
  const s = summary(store);
  const held = store.where("held", (h) => h.status === "pending").slice(-6).reverse();
  const doneSteps = store.where("steps", (x) => x.status === "done").slice(-8).reverse();
  const pendItems = held.map((h) => ({
    icon: iconOf(h.tool), text: h.preview, app: appOf(h.tool), status: "pending",
    summary: `${h.why} — held (${h.risk}); needs your approval before it runs.`, heldId: h.id,
  }));
  const doneItems = doneSteps.map((st) => ({
    icon: iconOf(st.tool), text: st.why || st.tool, app: appOf(st.tool), status: "done",
    summary: st.result && st.result.simulated ? "Ran (simulated in offline mode)." : "Done.",
  }));
  return {
    hoursSaved: s.hoursSaved, delta: 0, tasksDone: s.tasksDone, tasksDelta: 0,
    activeEmployees: 1, pendingApprovals: s.pending,
    weeklyGoal: Math.max(8, Math.ceil(s.hoursSaved * 1.2)),
    trend: trend7(store, s.hoursSaved), laborRate: 52,
    employees: [], withWithout: { withHours: s.hoursSaved, withoutHours: 0 },
    lastActionMin: 0, feed: [...pendItems, ...doneItems].slice(0, 10),
  };
}

export function summary(store) {
  const tasks = store.all("tasks");
  const steps = store.all("steps");
  const held = store.all("held");
  const minutesSaved = EST(steps);
  return {
    tasksDone: tasks.filter((t) => t.status === "done").length,
    tasksAwaiting: tasks.filter((t) => t.status === "awaiting_approval").length,
    tasksTotal: tasks.length,
    actionsRun: steps.filter((s) => s.status === "done").length,
    minutesSaved,
    hoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
    pending: held.filter((h) => h.status === "pending").length,
    heldTotal: held.length,
    feed: store.all("events").slice(-25).reverse(),
  };
}
