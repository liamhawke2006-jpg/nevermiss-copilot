// Upgrade 8 — actionable error messages. Turn a raw doer failure into a clear
// next step the person can act on, instead of a stack-trace fragment.
const MAP = [
  [/gmail not connected/i, "Gmail isn't connected for this tenant. Open the console → Connect Gmail, then approve again."],
  [/comms\.email not configured|SENDGRID_API_KEY/i, "Email isn't configured. Add a SendGrid API key (+ a verified From address) for this tenant."],
  [/SendGrid \d+/i, "The email provider rejected the send — check the API key and that the From address is a verified sender."],
  [/Gmail send \d+/i, "Google rejected the send — the connection may have expired; reconnect Gmail and try again."],
  [/outside the workspace|escape|ENOENT/i, "That path is outside the sandbox (or doesn't exist). File actions are limited to the tenant workspace."],
  [/capability disabled/i, "That capability is switched off for this tenant. Enable it in settings to allow this action."],
  [/OPENAI_API_KEY|ANTHROPIC_API_KEY/i, "The AI brain isn't configured — add the API key before running live tasks."],
];

export function humanize(message = "") {
  const m = String(message);
  for (const [re, friendly] of MAP) if (re.test(m)) return friendly;
  return m; // unknown errors pass through unchanged
}
