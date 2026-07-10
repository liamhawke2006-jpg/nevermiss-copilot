// Deterministic heuristic planner — used for the OFFLINE / no-key path (demo +
// tests). Real open-ended tasks are handled by the Claude tool-use agent in
// agent.js (engine.run routes to it when a key/client is present), not here.
const fileIn = (t) => (t.match(/([\w.\-\/]+\.(csv|txt|md|json|pdf|xlsx|docx|log|html))/i) || [])[1];
const S = (tool, args, why, est) => ({ tool, args, why, est });

export function planTask(prompt) {
  return planHeuristic(prompt);
}

function planHeuristic(prompt) {
  const t = prompt.toLowerCase();
  const f = fileIn(prompt);
  let steps;

  if (/invoice|follow.?up|remind|chase|overdue|past due/.test(t)) {
    steps = [
      S("files.read", { file: f || "invoices.csv" }, "Read the invoice ledger", 5),
      S("comms.email", { to: "client-a@example.com", subject: "Quick note on your invoice", body: "Friendly reminder…" }, "Draft follow-up to overdue client A", 8),
      S("comms.email", { to: "client-b@example.com", subject: "Quick note on your invoice", body: "Friendly reminder…" }, "Draft follow-up to overdue client B", 8),
    ];
  } else if (/clean|organi[sz]e|tidy|delete|remove|archive|clear out/.test(t)) {
    steps = [
      S("files.list", { dir: "." }, "Scan the workspace", 4),
      S("files.delete", { file: f || "old/" }, "Remove the stale files", 8),
    ];
  } else if (/back ?up|backup|export|copy|snapshot/.test(t)) {
    steps = [
      S("files.list", { dir: "." }, "Inventory what to back up", 4),
      S("files.write", { file: "backups/snapshot.txt", content: "backup manifest…" }, "Write the backup snapshot", 8),
    ];
  } else if (/summar|review|analy[sz]e|read through|go over/.test(t)) {
    steps = [S("files.read", { file: f || "notes.md" }, "Read and summarize the document", 12)];
  } else if (/post|tweet|publish|share|announce/.test(t)) {
    steps = [
      S("browser.read", { url: "https://status.internal" }, "Check the source page", 6),
      S("comms.slack", { channel: "#general", text: "Update…" }, "Post the update", 8),
    ];
  } else if (/run|build|deploy|install|execute|script|npm|make/.test(t)) {
    const cmd = (prompt.match(/`([^`]+)`/) || [])[1] || "npm run build";
    steps = [
      S("shell.read", { cmd: "ls" }, "Check the project", 3),
      S("shell.exec", { cmd }, `Run \`${cmd}\``, 15),
    ];
  } else if (/fetch|scrape|check (the )?(site|website|page)|pull from|download/.test(t)) {
    steps = [S("http.get", { url: "https://example.com/data" }, "Fetch the data", 6)];
  } else {
    steps = [
      S("files.list", { dir: "." }, "Look at what's here", 4),
      S("comms.email", { to: "you@example.com", subject: "Task result", body: "Here's what I found…" }, "Draft a result email", 8),
    ];
  }
  return { steps, summary: `Planned ${steps.length} steps for: ${prompt}` };
}
