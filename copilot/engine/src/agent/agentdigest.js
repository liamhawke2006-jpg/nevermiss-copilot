// AGENT MODE — weekly owner digest (c12). A plain-English summary of what Copilot
// did for a client this period: tasks, what completed, what's waiting on them, what
// it stopped on. The retention artifact the owner actually reads.
export function weeklyAgentDigest(sessions = [], clientId = "") {
  const byStatus = {};
  for (const s of sessions) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  const steps = sessions.flatMap((s) => s.steps || []);
  const d = {
    clientId,
    tasks: sessions.length,
    completed: byStatus.done || 0,
    waitingOnYou: byStatus.parked_approval || 0,
    stoppedSuspicious: byStatus.frozen || 0,
    handedBack: byStatus.blocked_handoff || 0,
    autoActions: steps.filter((x) => x.decision === "auto").length,
    piiShielded: steps.filter((x) => x.event === "pii_redacted").length,
  };
  d.text =
    `This period Copilot ran ${d.tasks} task(s): ${d.completed} completed, ${d.waitingOnYou} waiting on your approval` +
    `${d.stoppedSuspicious ? `, ${d.stoppedSuspicious} stopped on a suspicious page` : ""}. ` +
    `It handled ${d.autoActions} safe step(s) itself` +
    `${d.piiShielded ? `, shielded ${d.piiShielded} private value(s) from the AI,` : ""} ` +
    `and paused before anything left the building.`;
  return d;
}
