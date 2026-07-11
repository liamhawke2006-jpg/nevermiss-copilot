// AGENT MODE — action gates. ENFORCED IN CODE, never in the prompt. Every browser
// action a plan proposes is classified BEFORE it runs. The planning model cannot
// talk its way past this: even a fully jailbroken plan hits these functions.
//
//   TIER 1 AUTO   — navigate, read, search, extract, summarize, fill (no submit),
//                   download a report the client asked for.
//   TIER 2 HOLD   — any submit/send/post/publish/purchase/upload/setting-change/
//                   calendar-invite. Task parks; client approves the EXACT payload.
//   TIER 3 BLOCK  — credentials, card/bank/SSN/EIN entry, CAPTCHA, permanent
//                   deletion, money movement, sharing/permission changes. Code
//                   refuses, logs, and hands that part back to the client.

export const TIER = { AUTO: 1, HOLD: 2, BLOCK: 3 };

// Explicit action types that are always Tier 3 — refused no matter what.
const BLOCK_TYPES = new Set([
  "password_entry", "credential_entry", "card_entry", "bank_entry", "ssn_entry",
  "captcha", "delete_permanent", "money_transfer", "wire", "permission_change", "share_change",
]);

// Explicit action types that always need one-tap approval (Tier 2).
const HOLD_TYPES = new Set([
  "submit", "send", "send_email", "post", "publish", "purchase", "buy",
  "upload", "account_setting", "calendar_invite", "confirm",
]);

// Tier-1 action types (safe, reversible, no side effects).
const AUTO_TYPES = new Set([
  "navigate", "goto", "read", "extract", "search", "summarize", "scroll",
  "screenshot", "observe", "download", "hover", "wait", "back",
]);

// ---- sensitive-content detectors (block typing these into ANY field) ---------
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/;                 // 13–19 digit PAN
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;                    // US SSN
const EIN_RE = /\b\d{2}-\d{7}\b/;                          // US EIN
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;        // international bank account
const BTC_RE = /\b(bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/; // BTC wallet
const ETH_RE = /\b0x[a-fA-F0-9]{40}\b/;                   // ETH wallet
const CVV_RE = /\bcvv\b|\bcvc\b|security\s*code/i;
const SECRET_FIELD_RE = /pass(word|wd)?|passphrase|secret|private.?key|seed.?phrase|mnemonic|otp|2fa|mfa|ssn|social.?security|ein|routing|iban|swift|sort.?code|account.?number|card.?number|cardnum|cvv|cvc|\bpin\b|api.?key|token/i;
const luhn = (s) => {
  const d = String(s).replace(/[^\d]/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
};

// Button/link labels that reveal a benign-looking "click" is really a Tier 2/3 act.
const CLICK_BLOCK_RE = /\b(delete\s+(account|permanently)|close\s+account|wire|transfer\s+funds|remove\s+everyone)\b/i;
const CLICK_HOLD_RE = /\b(send|submit|pay|buy|purchase|place\s+order|checkout|publish|post|confirm|upload|invite|save\s+changes|apply)\b/i;

function looksSensitive(value = "", field = "") {
  if (SECRET_FIELD_RE.test(field)) return true;
  const v = String(value);
  if (SSN_RE.test(v) || EIN_RE.test(v) || IBAN_RE.test(v) || BTC_RE.test(v) || ETH_RE.test(v) || CVV_RE.test(field)) return true;
  if (CARD_RE.test(v) && luhn(v)) return true;
  return false;
}

// The gate. Returns { tier, reason, handoff? } for a proposed action.
export function classify(action = {}) {
  const type = String(action.type || "").toLowerCase();

  // 1) Typing a secret into a field is ALWAYS Tier 3, regardless of the action type.
  if ((type === "fill" || type === "type" || type === "input") && looksSensitive(action.value, action.field || action.selector)) {
    return { tier: TIER.BLOCK, reason: "would enter a credential / card / SSN — the client must do this themselves", handoff: true };
  }

  // 2) Explicit dangerous types.
  if (BLOCK_TYPES.has(type)) return { tier: TIER.BLOCK, reason: `Tier 3 action "${type}" is refused in code`, handoff: true };

  // 3) Clicks: inspect the label — a "Delete account" / "Pay" button isn't a safe click.
  if (type === "click" || type === "press") {
    const label = String(action.text || action.label || action.selector || "");
    if (CLICK_BLOCK_RE.test(label)) return { tier: TIER.BLOCK, reason: `click "${label}" is a Tier 3 action`, handoff: true };
    if (CLICK_HOLD_RE.test(label)) return { tier: TIER.HOLD, reason: `click "${label}" submits/sends — needs approval` };
    return { tier: TIER.AUTO, reason: "benign click (navigation/expand)" };
  }

  // 4) Explicit hold types.
  if (HOLD_TYPES.has(type)) return { tier: TIER.HOLD, reason: `"${type}" leaves the building — needs one-tap approval` };

  // 5) A safe fill (no secret) is Tier 1 — filling without submitting is allowed.
  if (type === "fill" || type === "type" || type === "input") return { tier: TIER.AUTO, reason: "fills a form field without submitting" };

  // 6) Known-safe types.
  if (AUTO_TYPES.has(type)) return { tier: TIER.AUTO, reason: `read-only action "${type}"` };

  // 7) UNKNOWN action → fail safe to HOLD (never auto-run something we can't classify).
  return { tier: TIER.HOLD, reason: `unrecognized action "${type}" — held to be safe` };
}

export const isBlocked = (a) => classify(a).tier === TIER.BLOCK;
export const needsApproval = (a) => classify(a).tier === TIER.HOLD;
