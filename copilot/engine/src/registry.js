// Tool registry — one place the agent looks up capabilities. Domains disabled in
// config are excluded entirely (kill switch): a disabled tool can never run.
import files from "./tools/files.js";
import shell from "./tools/shell.js";
import net from "./tools/net.js";
import gui from "./tools/gui.js";

const ALL = [...files, ...shell, ...net, ...gui];

export function buildRegistry(config) {
  const enabled = new Map();
  for (const t of ALL) {
    if (config.capabilities[t.domain]) enabled.set(t.id, t);
  }
  return {
    get: (id) => enabled.get(id) || null,
    has: (id) => enabled.has(id),
    list: () => [...enabled.values()].map((t) => ({ id: t.id, domain: t.domain, risk: t.risk, description: t.description })),
    domains: () => [...new Set([...enabled.values()].map((t) => t.domain))],
    // A tool id that exists but whose domain is off — so we can report "blocked".
    isKnownButDisabled: (id) => !enabled.has(id) && ALL.some((t) => t.id === id),
  };
}
