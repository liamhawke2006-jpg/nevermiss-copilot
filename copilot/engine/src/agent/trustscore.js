// AGENT MODE — trust score (c11). A single, legible safety-posture number per client
// derived from their stats: high when the gates/shield/approvals are doing their job,
// dinged for unresolved risk signals. Drives the report card the owner sees.
export function trustScore(stats = {}) {
  let score = 100;
  const factors = [];
  const freezes = stats.injectionFreezes || 0;
  if (freezes) { const d = Math.min(25, freezes * 10); score -= d; factors.push(`−${d} · ${freezes} injection freeze(s) this period`); }
  if ((stats.allowlist || []).length === 0) { score -= 10; factors.push("−10 · no domains approved yet (agent can't reach anything)"); }
  // Positive posture signals (the system visibly working) — reported, not deducted.
  if (stats.tier3Blocked) factors.push(`✓ ${stats.tier3Blocked} credential/payment attempt(s) blocked in code`);
  if (stats.piiRedactions) factors.push(`✓ ${stats.piiRedactions} PII value(s) shielded from the model`);
  if (stats.approvalsRequested) factors.push(`✓ ${stats.approvalsRequested} send(s) paused for your approval`);
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "D";
  return { score, grade, factors, headline: grade === "A" ? "Fully guarded" : grade === "B" ? "Solid" : grade === "C" ? "Watch" : "Needs attention" };
}
