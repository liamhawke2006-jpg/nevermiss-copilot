import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMemory } from "../src/store.js";
import { buildRegistry } from "../src/registry.js";

export function mkEnv(over = {}) {
  const ws = mkdtempSync(join(tmpdir(), "copilot-"));
  mkdirSync(join(ws, "old"), { recursive: true });
  writeFileSync(join(ws, "old", "stale.txt"), "old");
  writeFileSync(join(ws, "invoices.csv"), "client,amount,days\nAcme,1200,18\nBeeCo,900,34\n");
  writeFileSync(join(ws, "notes.md"), "# notes\n- ship it\n");

  const caps = { files: true, shell: true, http: true, comms: true, browser: true, desktop: true, ...(over.capabilities || {}) };
  const config = {
    offline: true, workspace: ws, autonomy: "auto-safe-hold-world",
    capabilities: caps, anthropic: { key: "", model: "x" }, dbPath: ":mem:", port: 0,
    ...over, capabilities: caps,
  };
  return { ws, config, store: openMemory(), registry: buildRegistry(config) };
}
