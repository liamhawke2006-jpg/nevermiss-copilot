// AGENT MODE — prompt-injection defense (v2). Everything read from a page/email/doc
// is DATA, never instructions. Extracted content is normalized (to defeat hidden/
// obfuscated payloads) and scanned before it enters the planning context. A hit
// FREEZES the task (never "filter and continue") and surfaces evidence for go/no-go.

// ---- normalization: defeat the tricks that beat naive scanners -----------------
const ZERO_WIDTH = /[​-‍⁠﻿᠎]/g;      // zero-width spaces/joiners
const UNICODE_TAGS = /[\u{E0000}-\u{E007F}]/gu;               // unicode "tag" chars (invisible)
function normalize(s = "") {
  let t = String(s);
  try { t = t.normalize("NFKC"); } catch {}                  // fold homoglyphs / full-width
  const hadInvisible = ZERO_WIDTH.test(t) || UNICODE_TAGS.test(t);
  t = t.replace(ZERO_WIDTH, "").replace(UNICODE_TAGS, "");
  return { text: t, hadInvisible };
}

// Imperative text aimed at the agent — the classic injection payloads.
const IMPERATIVE = [
  /ignore (all |any |the )?(previous|prior|above|earlier|preceding) (instructions|prompts|context|messages)/i,
  /disregard (your|the|all|any) (instructions|rules|system prompt|guidelines)/i,
  /you are now|new instructions|updated instructions|system override|developer mode|jailbreak|DAN mode/i,
  /\b(do not tell|don't tell|without telling|hide this from) (the|your)? ?(user|client|owner|human)\b/i,
  /\bas (an|your) ai\b.*\b(you must|you should|please|now)\b/i,
  /\b(send|email|forward|transfer|pay|wire|post|publish|delete|upload|exfiltrate|leak) (this|it|the|all|everything|funds|data|report)\b.*\b(to|at)\b/i,
  /\b(navigate|go|browse) to\b.*\b(https?:|www\.)/i,
  /\b(reveal|print|show|repeat|output|dump)\b.*\b(system prompt|instructions|api key|password|secret|token|credentials)\b/i,
  /\bapprove\b.*\b(automatically|without asking|on your own|this for me|silently)\b/i,
  /\b(act|pretend|roleplay) as\b.*\b(admin|system|developer|owner|different)\b/i,
];
// Tool-call / function-call-looking syntax embedded in content (agents get fooled).
const TOOL_SYNTAX = [
  /```[\s\S]*?"(tool|action|function|command)"\s*:/i,
  /<(tool_call|function_call|action|invoke)\b/i,
  /\{\s*"(type|tool|action)"\s*:\s*"(send|submit|navigate|delete|pay|approve)/i,
];
// Signals that content is hidden — a favorite injection vector.
const HIDDEN_SIGNALS = [
  /display\s*:\s*none/i, /visibility\s*:\s*hidden/i, /opacity\s*:\s*0\b/i, /font-size\s*:\s*0\b/i,
  /color\s*:\s*#?f{3,6}\b[\s\S]{0,40}background\s*:\s*#?f{3,6}/i,
  /aria-hidden\s*=\s*["']?true/i, /position\s*:\s*absolute;?\s*(left|top)\s*:\s*-\d{3,}/i,
  /<!--[\s\S]*?(instruction|ignore|system|approve|send|delete)[\s\S]*?-->/i,
  /text-indent\s*:\s*-\d{3,}/i, /clip\s*:\s*rect\(0/i, /height\s*:\s*0(px)?;?\s*overflow\s*:\s*hidden/i,
];
const SUSPICIOUS_ATTR = [
  /data-(ai|agent|assistant|system|prompt|instruction)[-a-z]*\s*=/i,
  /\b(aria-label|alt|title|placeholder)\s*=\s*["'][^"']*\b(ignore|approve|send|delete|password|transfer|wire)\b/i,
];
const LOOKALIKE_APPROVAL = /\b(click|press|tap) (here|approve|confirm|continue) to (verify|continue|approve|authori[sz]e|proceed)\b/i;

// Base64 blobs that DECODE to an injection (payloads smuggled as encoded text).
function base64Injection(s) {
  const hits = [];
  for (const m of String(s).matchAll(/\b([A-Za-z0-9+/]{24,}={0,2})\b/g)) {
    try {
      const dec = Buffer.from(m[1], "base64").toString("utf8");
      if (/[\x20-\x7e]{8,}/.test(dec) && IMPERATIVE.some((re) => re.test(dec))) hits.push(clip(dec));
    } catch {}
  }
  return hits;
}

export function scanInjection(text = "", html = "") {
  const reasons = []; const evidence = [];
  const n = normalize(text); const rawHtml = String(html || "");
  const nHtml = normalize(rawHtml);
  const push = (label, ev) => { reasons.push(label); if (ev) evidence.push(clip(ev)); };

  const runGroup = (patterns, label, source) => { for (const re of patterns) { const m = source.match(re); if (m) push(label, m[0]); } };

  if (n.hadInvisible || nHtml.hadInvisible) push("invisible-characters", "zero-width / unicode-tag characters found in content");
  runGroup(IMPERATIVE, "imperative-aimed-at-agent", n.text);
  runGroup(IMPERATIVE, "imperative-aimed-at-agent", nHtml.text);
  runGroup(TOOL_SYNTAX, "embedded-tool-call", n.text);
  runGroup(TOOL_SYNTAX, "embedded-tool-call", rawHtml);
  runGroup(HIDDEN_SIGNALS, "hidden-content", rawHtml);
  runGroup(SUSPICIOUS_ATTR, "suspicious-dom-attribute", rawHtml);
  if (LOOKALIKE_APPROVAL.test(n.text) || LOOKALIKE_APPROVAL.test(nHtml.text)) push("lookalike-approval-dialog", (n.text.match(LOOKALIKE_APPROVAL) || nHtml.text.match(LOOKALIKE_APPROVAL))[0]);
  for (const ev of base64Injection(n.text)) push("base64-encoded-injection", ev);

  return { flagged: reasons.length > 0, reasons: [...new Set(reasons)], evidence: evidence.slice(0, 8) };
}

// A URL/email/payment destination that came from PAGE CONTENT (not the client's
// typed assignment) may never be auto-navigated/sent to. Forces Tier-2 approval.
export function destinationFromContent(url, assignment = "") {
  if (!url) return false;
  return !String(assignment).includes(String(url));
}

function clip(s, n = 160) { s = String(s); return s.length > n ? s.slice(0, n) + "…" : s; }
