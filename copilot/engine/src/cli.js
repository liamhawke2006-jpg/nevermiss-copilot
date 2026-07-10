// Copilot CLI. Examples:
//   node src/cli.js assign "chase the overdue invoices in invoices.csv"
//   node src/cli.js pending
//   node src/cli.js approve 3
//   node src/cli.js demo
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { openStore } from "./store.js";
import { buildRegistry } from "./registry.js";
import { assign, run } from "./engine.js";
import { approve, deny, pending } from "./approvals.js";
import { summary } from "./results.js";

const store = openStore(config.dbPath);
const registry = buildRegistry(config);
const [, , cmd, ...rest] = process.argv;

function showPending() {
  const p = pending(store);
  if (!p.length) return console.log("No actions waiting for approval. ✓");
  console.log("\nWaiting on you (Approve/Deny):");
  for (const h of p) console.log(`  [${h.id}] ${h.tool} (${h.risk})  —  ${h.preview}`);
}

async function main() {
  switch (cmd) {
    case "assign": {
      const prompt = rest.join(" ");
      if (!prompt) return console.error('usage: assign "<task>"');
      const t = assign(store, prompt);
      const r = await run(store, t.id, { config, registry });
      console.log(`Task #${t.id} → ${r.status}  (${r.done} ran, ${r.held} held, ${r.errors} err)`);
      showPending();
      break;
    }
    case "tasks":
      for (const t of store.all("tasks")) console.log(`#${t.id} [${t.status}] ${t.prompt}`);
      break;
    case "pending":
      showPending();
      break;
    case "approve": {
      const h = await approve(store, Number(rest[0]), { config, registry });
      console.log(`Action ${h.id} → ${h.status}`);
      break;
    }
    case "deny": {
      const h = deny(store, Number(rest[0]));
      console.log(`Action ${h.id} → ${h.status}`);
      break;
    }
    case "results":
      console.log(JSON.stringify(summary(store), null, 2));
      break;
    case "demo": {
      const ws = config.workspace;
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, "invoices.csv"), "client,amount,days_past\nAcme,1200,18\nBeeCo,900,34\n");
      writeFileSync(join(ws, "notes.md"), "# Standup\n- ship copilot\n- chase AR\n");
      for (const p of [
        "chase the overdue invoices in invoices.csv",
        "summarize notes.md",
        "clean up the old/ folder",
        "run `npm run build`",
      ]) {
        const t = assign(store, p);
        const r = await run(store, t.id, { config, registry });
        console.log(`#${t.id} "${p}" → ${r.status} (${r.done} ran, ${r.held} held)`);
      }
      showPending();
      console.log("\nResults:", JSON.stringify(summary(store)));
      break;
    }
    default:
      console.log("commands: assign <task> | tasks | pending | approve <id> | deny <id> | results | demo");
  }
}
main();
