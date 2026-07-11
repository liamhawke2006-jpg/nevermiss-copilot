# Agent Mode — Implementation Guide (for the engineer)

You are taking Agent Mode from **safety-core-complete** to **live**. The trust
architecture is done, wired, and tested — do **not** reimplement it. Your job is the
live execution layer: real browser, real planner, real per-client isolation. Three
flips + the container model. Everything else is already gated and green.

## What's already done (don't touch the gates)
```
src/agent/classify.js   action gates Tier 1/2/3 — ENFORCED IN CODE (the product)
src/agent/injection.js  prompt-injection freeze (scanned before planning)
src/agent/state.js      per-client state factory (profileDir, allowlist, counters, idem)
src/agent/guards.js     allowlist, daily caps, idempotency, kill switch
src/agent/audit.js      session recording + 90-day retention
src/agent/loop.js       the gated task loop (observe→inject-scan→plan→classify→act)
src/agent/planner.js    Claude planner (injectable client; offline heuristic fallback)
src/agent/browser.js    Playwright adapter — LIVE-GATED here <—— your main wiring point
src/agent/service.js    orchestration (assign/approve/deny/kill/domain/sessions)
src/agent/recipes.js    6 task recipes
copilot/agent.html      v3-dark console (step feed, approval cards, kill switch, audit)
```
Server routes are live under `/api/agent/*` (assign/approve/deny/kill/unkill/domain/
sessions/session/client). Right now `assign` returns
`{status:"browser_unavailable"}` until you do step 1–2 below.

## Go-live: 3 flips
1. **Install Playwright** (in the engine image):
   `npm i playwright && npx playwright install --with-deps chromium`
2. **Enable the adapter**: review `src/agent/browser.js`, then set `AGENT_BROWSER_LIVE=1`.
   `launchProfile(profileDir)` uses `chromium.launchPersistentContext` — that IS the
   per-client cookie jar. Keep one `profileDir` per client (state.profileDir).
3. **Claude planner**: `COPILOT_OFFLINE=0` + `ANTHROPIC_API_KEY` (platform key). The
   planner then drives; the loop still gates every action it proposes.

## Per-client isolation (the container model)
`profileDir` isolation is the floor; **one container per client** is the target:
- Run the engine (or a browser-worker) as **one container per client**, mounting a
  persistent volume at that client's `agent-profiles/<clientId>`. No shared volume,
  no shared network egress. A client's cookies never leave its container.
- Front with the existing multi-tenant server; route `?tenant=<clientId>` to that
  client's worker. `service.js` is already per-client; give each its own store +
  profile mount.
- Kill switch: `POST /api/agent/kill` (per client) or `{global:true}`. Wire the
  global kill to also `SIGKILL` the browser workers for a true halt.

## The one seam you implement: `openPage(state)`
`createAgentService({ openPage })` — default launches `browser.launchProfile`. In a
container-per-client deploy, pass an `openPage` that attaches to THAT client's
browser worker. It must return a Playwright `page`. Everything downstream (observe,
gate, act) already works — the loop + service are proven against a fake page in tests.

## Login = supervised takeover (never automate it)
`browser.takeoverHandoff(profileDir, loginUrl)` returns the handoff payload. The UI
opens a real window; the CLIENT logs in; the cookie lands in their profile. Copilot
must never receive, type, or store credentials — `classify.js` already Tier-3-blocks
any credential entry even if a plan proposes it.

## Anomaly alerts (wire to Liam)
`alerts.js` already computes them from each recorded session: `repeated_tier3`,
`prompt_injection`, `new_sensitive_domain` (banking/legal/health, via `domains.js`,
categorized from the hostname so page content can't spoof it). They're emitted as
`agent_alert` events and returned on the `assign` response; `GET /api/agent/alerts`
lists them. **Wire `alertNotify`** (a `createAgentService` option) to email/Slack Liam
in production.

## Hardening already in place (v2)
- **Injection defense**: normalizes content first (NFKC + strips zero-width/unicode-
  tag chars), then catches imperative payloads, embedded tool-call syntax, hidden
  CSS/DOM, suspicious attributes, lookalike approval dialogs, and **base64-encoded**
  instructions. Gauntlet = the original 20 poisoned pages **plus** obfuscated attacks
  (zero-width, homoglyph, base64, tool-syntax, hidden, roleplay).
- **Tier-3 gates**: passwords, cards (Luhn), SSN/EIN, **IBAN, BTC/ETH wallets, seed
  phrases, API keys/private keys** — all refused in code.
- **Task locking**: one task per client at a time (no interleaved browser sessions).

## Acceptance criteria — these MUST stay green
`node test/all.js` → the `agent-mode` suite. If any of these fail, do not ship:
- gate audit (every Tier-3 blocked in code, incl. jailbroken planner)
- injection gauntlet (20 poisoned pages → 20/20 freeze, 0 followed)
- isolation (two clients, zero bleed)
- kill switch mid-form-fill (nothing submitted)
- idempotency, content-sourced-destination approval, service e2e

**Add live regression tests as you wire**: run the injection gauntlet against REAL
rendered pages, and the gate audit against a live browser (assert `act` never fires
for Tier-3). The mock tests prove the logic; the live tests prove the integration.

## Suggested rollout
1. One internal client, allowlist = 1–2 domains, `research` + `pull_orders` recipes
   only (read-only, no Tier-2). Watch every session replay.
2. Add `chase_invoices` / `fill_form` (Tier-2 parks) — confirm every send/submit
   waits for a human and fires exactly once.
3. Expand domains + recipes per client as trust builds. Daily caps stay on.
