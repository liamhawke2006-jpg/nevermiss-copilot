// AGENT MODE — Ask-First clarification engine (flagship). When the task is ambiguous
// or a planned step is low-confidence, the agent PAUSES and asks the client a crisp
// question instead of guessing. The difference between a tool that's confidently
// wrong and one you can trust. Returns a question string, or null to proceed.
import { detectAmbiguity } from "./ambiguity.js";
import { confidenceOf } from "./confidence.js";

export const CONFIDENCE_FLOOR = 0.55;

export function clarify({ assignment = "", action = null, observation = {} } = {}) {
  // 1) Ambiguous assignment — a critical blank we must not guess.
  const amb = detectAmbiguity(assignment);
  if (amb.ambiguous) return amb.question;
  // 2) Low-confidence step — ask rather than act.
  if (action) {
    const c = confidenceOf(action, { assignment, observation });
    if (c.score < CONFIDENCE_FLOOR) return `I'm not confident about this step (${c.reasons.join(", ") || "unclear target"}). Can you confirm what you'd like me to do?`;
  }
  return null;
}
