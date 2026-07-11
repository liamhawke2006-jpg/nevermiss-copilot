// AGENT MODE — PII shield. Content scraped from a page can contain a customer's
// SSN, card, phone, or email. We redact those from the text BEFORE it enters the
// planner's context — the model completes the task without ever ingesting the raw
// PII. (The gates already refuse to TYPE secrets; this stops us READING them into
// the model.) Returns the scrubbed text + a count so the UI can say "3 PII redacted".
const RULES = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, "ssn"],
  [/\b(?:\d[ -]?){13,19}\b/g, "card"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "email"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "phone"],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "iban"],
];

export function shieldPII(text = "") {
  let out = String(text);
  let redactions = 0;
  const kinds = {};
  for (const [re, kind] of RULES) {
    out = out.replace(re, () => { redactions++; kinds[kind] = (kinds[kind] || 0) + 1; return `«${kind}»`; });
  }
  return { text: out, redactions, kinds };
}
