// Copilot engine config — capabilities (kill switches) + the autonomy policy.
import "node:process";

const bool = (v, d) => (v === undefined ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));

export const config = {
  // OFFLINE: adapters that would touch the network / a live desktop instead
  // capture a simulated result, so the whole engine runs and tests with no keys.
  offline: bool(process.env.COPILOT_OFFLINE, true),

  // Sandbox root for file + shell tools. Everything is resolved inside this dir;
  // escaping it is refused. Keeps "can do anything" bounded to a known area.
  workspace: process.env.COPILOT_WORKSPACE || "workspace",

  dbPath: process.env.COPILOT_DB || "data/copilot.json",
  port: Number(process.env.PORT || process.env.COPILOT_PORT || 3300), // PORT for Railway/Render

  // Kill switches — one agent, each capability domain independently on/off.
  capabilities: {
    files: bool(process.env.CAP_FILES, true),
    shell: bool(process.env.CAP_SHELL, true),
    http: bool(process.env.CAP_HTTP, true),
    comms: bool(process.env.CAP_COMMS, true),
    browser: bool(process.env.CAP_BROWSER, true),
    desktop: bool(process.env.CAP_DESKTOP, true),
  },

  // Autonomy policy (chosen: auto-run safe, hold anything world-changing).
  // Options: 'auto-safe-hold-world' | 'approve-everything' | 'full-auto'
  autonomy: process.env.COPILOT_AUTONOMY || "auto-safe-hold-world",

  anthropic: { key: process.env.ANTHROPIC_API_KEY || "", model: process.env.COPILOT_MODEL || "claude-sonnet-4-6" },

  // First real "doer": email via SendGrid (API key only — no OAuth, works headless).
  sendgrid: { key: process.env.SENDGRID_API_KEY || "", from: process.env.MAIL_FROM || "copilot@example.com" },

  // Browser doer (Playwright). Headless by default.
  browserHeadless: bool(process.env.COPILOT_BROWSER_HEADLESS, true),

  // Gmail OAuth (send-only). Set these + register the redirect to enable "Connect Gmail".
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectBase: process.env.OAUTH_REDIRECT_BASE || `http://localhost:${Number(process.env.COPILOT_PORT || 3300)}`,
  },
};
