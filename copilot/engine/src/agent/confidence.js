// AGENT MODE — action confidence (c31). A 0..1 score from concrete signals about a
// planned action. Low confidence feeds Ask-First: pause and ask rather than guess.
export function confidenceOf(action = {}, { assignment = "", observation = {} } = {}) {
  const reasons = [];
  let score = 0.9;
  const t = String(action.type);
  if ((t === "send_email" || t === "send") && !action.to) { score -= 0.45; reasons.push("no recipient"); }
  if ((t === "navigate" || t === "goto") && !action.url) { score -= 0.45; reasons.push("no destination URL"); }
  if ((t === "fill" || t === "type") && (action.value === undefined || action.value === "")) { score -= 0.25; reasons.push("empty value"); }
  if ((t === "publish" || t === "post") && !(observation && String(observation.text || ""))) { score -= 0.2; reasons.push("nothing staged to publish"); }
  return { score: Math.max(0, Math.min(1, score)), reasons };
}
