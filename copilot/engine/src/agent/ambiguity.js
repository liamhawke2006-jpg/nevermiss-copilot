// AGENT MODE — assignment ambiguity (c32). Does the plain-English task leave a
// critical blank the agent must NOT guess? Returns a clarifying question or null.
export function detectAmbiguity(assignment = "") {
  const a = String(assignment).toLowerCase();

  const asksSend = /\b(email|send|message|remind|recap|reply|notify|forward)\b/.test(a);
  const hasRecipient =
    /@/.test(a) ||
    /\b(the|my|our)\s+(client|customer|manager|owner|team|boss|accountant|buyer|vendor|supplier)\b/.test(a) ||
    /\bto\s+[a-z]+/.test(a);
  if (asksSend && !hasRecipient) return { ambiguous: true, question: "Who should I send this to?" };

  const asksBook = /\b(book|schedule|reschedule|appointment|meeting)\b/.test(a);
  const hasWhen = /\b(mon|tue|wed|thu|fri|sat|sun|today|tomorrow|next week|\d{1,2}(:\d{2})?\s?(am|pm))\b/.test(a);
  if (asksBook && !hasWhen) return { ambiguous: true, question: "What day and time should I book?" };

  const asksBuy = /\b(buy|purchase|order|pay)\b/.test(a);
  if (asksBuy && !/\$|\d/.test(a)) return { ambiguous: true, question: "What exactly should I buy, and is there a budget limit?" };

  return { ambiguous: false, question: null };
}
