// Human-readable one-liner for a held action — shown on the Approve/Deny card.
export function previewOf(toolId, args = {}) {
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
