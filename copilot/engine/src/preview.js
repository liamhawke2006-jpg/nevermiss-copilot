import { redact } from "./redact.js";

// Upgrade 10 — full detail for informed consent. The one-liner tells you WHAT;
// this shows the exact recipient/subject/body (or command/path) you're approving,
// truncated + secret-redacted, so the irreversible click is never blind.
export function detailOf(toolId, args = {}) {
  const clip = (s, n = 600) => { const t = String(s ?? ""); return t.length > n ? t.slice(0, n) + "…" : t; };
  let d;
  switch (toolId) {
    case "comms.email":
    case "comms.gmail":
      d = { kind: "email", to: args.to, subject: args.subject || "(no subject)", body: clip(args.body) }; break;
    case "comms.slack":
      d = { kind: "message", channel: args.channel, body: clip(args.text) }; break;
    case "files.write":
      d = { kind: "file", path: args.file, body: clip(args.content) }; break;
    case "files.delete":
      d = { kind: "delete", path: args.file }; break;
    case "shell.exec":
      d = { kind: "command", command: clip(args.cmd, 300) }; break;
    case "http.post":
      d = { kind: "http", url: args.url, body: clip(typeof args.body === "string" ? args.body : JSON.stringify(args.body || {})) }; break;
    default:
      d = { kind: "generic", args: clip(JSON.stringify(args)) };
  }
  return redact(d);
}

// Human-readable one-liner for a held action — shown on the Approve/Deny card.
export function previewOf(toolId, args = {}) {
  return redact(previewLine(toolId, args));
}
function previewLine(toolId, args = {}) {
  switch (toolId) {
    case "comms.email": return `Send email to ${args.to} — “${args.subject}”`;
    case "comms.gmail": return `Send Gmail to ${args.to} — “${args.subject}”`;
    case "comms.slack": return `Post to Slack ${args.channel}: “${args.text}”`;
    case "files.write": return `Write file ${args.file} (${(args.content || "").length} bytes)`;
    case "files.delete": return `Delete ${args.file}`;
    case "shell.exec": return `Run shell: ${args.cmd}`;
    case "http.post": return `POST to ${args.url}`;
    case "browser.act": return `${args.action} on ${args.selector}`;
    case "desktop.act": return `Desktop: ${args.action}`;
    default: return `${toolId} ${JSON.stringify(args)}`;
  }
}
