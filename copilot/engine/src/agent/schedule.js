// AGENT MODE — recurring tasks (c34). "Every Monday at 07:00, chase invoices."
// Store-backed; a scheduler tick asks which are due and assigns them (still fully
// gated — a recurring task parks its sends for approval like any other).
export function scheduleTask(store, { clientId, dow, time, prompt }) {
  return store.insert("agentSchedules", { clientId: String(clientId), dow, time, prompt, active: 1, lastRun: null });
}
export function listSchedules(store, clientId) {
  return store.where("agentSchedules", (s) => s.clientId === String(clientId) && s.active);
}
// Which schedules are due right now (and haven't already run today).
export function dueSchedules(store, { dow, hhmm, day }) {
  return store.where("agentSchedules", (s) => s.active && s.dow === dow && s.time === hhmm && s.lastRun !== day);
}
export function markRun(store, id, day) { store.update("agentSchedules", id, { lastRun: day }); }
export function cancelSchedule(store, id) { store.update("agentSchedules", id, { active: 0 }); }
