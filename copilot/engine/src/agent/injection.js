// AGENT MODE — prompt-injection defense. Everything read from a page/email/doc is
// DATA, never instructions. Before extracted content enters the planning context we
// run it through this classifier. A hit FREEZES the task (never "just filter and
// continue") and surfaces the offending content to the client for go/no-go.

// Imperative text aimed at the agent — the classic injection payloads.
const IMPERATIVE = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts|context)/i,
  /disregard (your|the|all) (instructions|rules|system prompt)/i,
  /you are now|new instructions|updated instructions|system override|developer mode/i,
  /\b(do not tell|don't tell|without telling) (the|your) (user|client|owner)\b/i,
  /\bas an ai\b.*\b(you must|you should|please)\b/i,
  /\b(send|email|forward|transfer|pay|wire|post|publish|delete|upload) (this|it|the|all|everything|funds)\b.*\b(to|at)\b/i,
  /\bnavigate to\b|\bgo to\b.*\b(http|www\.)/i,
  /\breveal|print|show\b.*\b(system prompt|instructions|api key|password|secret|token)\b/i,
  /\bapprove\b.*\b(automatically|without asking|on your own)\b/i,
];

// Signals that content is hidden — a favorite injection vector.
const HIDDEN_SIGNALS = [
  /display\s*:\s*none/i, /visibility\s*:\s*hidden/i, /opacity\s*:\s*0/i,
  /font-size\s*:\s*0/i, /color\s*:\s*#?fff(fff)?\b.*background\s*:\s*#?fff/i,
  /aria-hidden\s*=\s*["']?true/i, /position\s*:\s*absolute;?\s*left\s*:\s*-\d{3,}/i,
  /<!--[\s\S]*?(instruction|ignore|system|approve)[\s\S]*?-->/i,
];

// Suspicious DOM attributes that carry instructions to an agent.
const SUSPICIOUS_ATTR = [
  /data-(ai|agent|assistant|system|prompt)[-a-z]*\s*=/i,
  /\baria-label\s*=\s*["'][^"']*\b(ignore|approve|send|delete|password)\b/i,
];

const LOOKALIKE_APPROVAL = /\b(click|press) (here|approve|confirm) to (verify|continue|approve|authori[sz]e)\b/i;

// Scan a chunk of extracted page text (+ optional raw html) for injection. Returns
// { flagged, reasons[], evidence[] }. evidence is the exact offending snippets.
export function scanInjection(text = "", html = "") {
  const reasons = [];
  const evidence = [];
  const hay = String(text || "");
  const raw = String(html || "");

  const check = (patterns, label, source) => {
    for (const re of patterns) {
      const m = source.match(re);
      if (m) { reasons.push(label); evidence.push(clip(m[0])); }
    }
  };
  check(IMPERATIVE, "imperative-aimed-at-agent", hay);
  check(IMPERATIVE, "imperative-aimed-at-agent", raw);
  check(HIDDEN_SIGNALS, "hidden-content", raw);
  check(SUSPICIOUS_ATTR, "suspicious-dom-attribute", raw);
  if (LOOKALIKE_APPROVAL.test(hay) || LOOKALIKE_APPROVAL.test(raw)) { reasons.push("lookalike-approval-dialog"); evidence.push(clip((hay.match(LOOKALIKE_APPROVAL) || raw.match(LOOKALIKE_APPROVAL))[0])); }

  return { flagged: reasons.length > 0, reasons: [...new Set(reasons)], evidence: evidence.slice(0, 6) };
}

// A URL/email/payment destination that came from PAGE CONTENT (not the client's
// typed assignment) may never be auto-navigated/sent to. The loop calls this to
// force Tier-2 approval on any content-sourced destination.
export function destinationFromContent(url, assignment = "") {
  if (!url) return false;
  return !String(assignment).includes(String(url));
}

function clip(s, n = 160) { s = String(s); return s.length > n ? s.slice(0, n) + "…" : s; }
