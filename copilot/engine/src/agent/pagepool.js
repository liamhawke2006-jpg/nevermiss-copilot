// AGENT MODE — production page pool. One isolated persistent browser context PER
// CLIENT, launched once and reused across tasks so logins/cookies survive. This is
// the `openPage(state)` the service uses in production. LIVE-gated via browser.js:
// throws (clearly) until Playwright is installed + AGENT_BROWSER_LIVE=1 — the
// deliberate human-reviewed go-live step.
import { launchProfile } from "./browser.js";

const pool = new Map(); // clientId -> { ctx, page, close }

export function makeOpenPage(config = {}) {
  return async function openPage(state) {
    let p = pool.get(state.clientId);
    if (!p) {
      p = await launchProfile(state.profileDir, { headless: config.browserHeadless !== false });
      pool.set(state.clientId, p);
    }
    return p.page;
  };
}

// Kill switch integration: close a client's browser for real (releases the context).
export async function closeClient(clientId) {
  const p = pool.get(clientId);
  if (p) { try { await p.close?.(); } catch {} pool.delete(clientId); }
}

// Global halt: tear down every client's browser.
export async function closeAll() {
  for (const id of [...pool.keys()]) await closeClient(id);
}
