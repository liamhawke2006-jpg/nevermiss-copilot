// AGENT MODE — per-client isolated state. One record per client: its own domain
// allowlist, its own daily counters, its own kill switch, its own idempotency
// ledger. Nothing is shared across clients — that isolation is the product.
export function newClientState(clientId) {
  return {
    clientId: String(clientId),
    profileDir: `agent-profiles/${clientId}`, // isolated browser profile (cookies live here, per-client)
    allowlist: [],                             // starts EMPTY — client approves each domain once
    killed: false,
    counters: { day: null, approvalsRequested: 0, emailsSent: 0 },
    idempotency: [],                           // keys of actions already fired (double-fire impossible)
    createdAt: nowIso(),
  };
}

export function nowIso() { return new Date().toISOString().slice(0, 19).replace("T", " "); }
