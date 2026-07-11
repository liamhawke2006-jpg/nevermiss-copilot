// Upgrade 5 — secret redaction. Nothing that looks like a credential should ever
// land in a preview, event summary, or stored result that the console renders.
const PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{6,}/g,            // Anthropic keys
  /sk-[A-Za-z0-9]{20,}/g,                 // OpenAI-style keys
  /SG\.[A-Za-z0-9_.-]{10,}/g,             // SendGrid keys
  /AKIA[0-9A-Z]{12,}/g,                   // AWS access key ids
  /ya29\.[A-Za-z0-9_-]{10,}/g,            // Google OAuth access tokens
  /1\/\/[A-Za-z0-9_-]{20,}/g,             // Google refresh tokens
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,       // bearer headers
  /\b[A-Fa-f0-9]{40,}\b/g,                // long hex secrets
];
const MASK = "«redacted»";

export function redact(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return PATTERNS.reduce((s, re) => s.replace(re, MASK), value);
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Redact by key name too (token/secret/key/password fields), regardless of shape.
      out[k] = /token|secret|password|apikey|api_key|refresh/i.test(k) && v ? MASK : redact(v);
    }
    return out;
  }
  return value;
}
