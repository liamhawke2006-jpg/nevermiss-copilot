# NeverMiss Copilot — Agent Mode Runbook

Agent Mode completes multi-step web tasks from plain-English assignments. The trust
architecture **is the product**: every action is classified and gated **in code**,
not in the prompt. This runbook covers what's built, how to take it live, and the
tests that must stay green.

## What's built (in `src/agent/`)
- **`classify.js`** — the action gates (Tier 1 auto / Tier 2 hold / Tier 3 block). The
  planner cannot bypass these; even a jailbroken plan hits these functions.
- **`injection.js`** — prompt-injection classifier. Page content is DATA, never
  instructions. A hit **freezes** the task before content reaches the planner.
- **`state.js` / `guards.js`** — per-client state: domain allowlist (starts empty),
  daily caps, idempotency ledger, kill switch. Nothing is shared across clients.
- **`audit.js`** — full session recording (timestamped actions + screenshots), 90-day
  retention.
- **`browser.js`** — Playwright adapter, per-client persistent profile (isolated
  cookies). LIVE-gated. Includes the supervised-takeover login handoff.
- **`planner.js`** — Claude planner (injectable client; offline heuristic for
  demo/test). Grounded system prompt: the assignment is the only source of goals.
- **`loop.js`** — the task loop that wires it all together.
- **`recipes.js`** — the 6 shipped task recipes.

## The gates (enforced in `classify.js`)
| Tier | Actions | Behavior |
|---|---|---|
| 1 AUTO | navigate, read, search, extract, summarize, **fill without submit**, download a requested report | runs automatically |
| 2 HOLD | any submit/send/post/publish/purchase/upload/setting-change/calendar-invite | **task parks**; client sees the exact payload + a screenshot of the filled state, approves per-action (never blanket, never remembered) |
| 3 BLOCK | passwords, card/bank/SSN/EIN entry, CAPTCHA, permanent deletion, money movement, sharing/permission changes | **refused in code**, logged, handed back to the client |

Login is never automated — the client logs in themselves via the **supervised
takeover window**; Copilot never sees, types, or stores credentials. The session
cookie persists in their isolated profile.

## Taking it LIVE (gated on purpose)
The safety core runs + tests offline. Live browser control needs three things, each
a deliberate step:

1. **Playwright**: `npm i playwright && npx playwright install chromium`
2. **Enable the adapter**: set `AGENT_BROWSER_LIVE=1` (after reviewing `browser.js`).
3. **Claude planner**: `COPILOT_OFFLINE=0` + `ANTHROPIC_API_KEY` (platform key).

Per-client isolation in production = one **container per client** (or at minimum a
dedicated OS user + `profileDir` per client). `launchPersistentContext(profileDir)`
keeps each client's cookies in their own jar — never share a profile.

### Blast-radius env
```
AGENT_MAX_APPROVALS_PER_DAY=25   # Tier-2 approvals requested/day
AGENT_MAX_EMAILS_PER_DAY=20      # emails sent/day
AGENT_MAX_TASK_MIN=15            # runtime before a task parks + reports
```
Kill switch: `engageKill(state)` per client, `engageGlobalKill()` for all — halts the
loop at the next step boundary; a Tier-2 action mid-approval never fires.

## Anomaly alerts (wire to Liam)
Alert on: repeated Tier-3 attempts in one task, any injection freeze, or a task
touching a never-before-seen domain **category** (banking/legal). Hook these off the
audit `event` types: `injection_freeze`, `blocked` (tier 3), `domain_not_allowed`.

## Tests that MUST pass before any client touches it
`node test/all.js` → the `agent-mode` suite proves:
- **Gate audit** — every Tier-3 action blocked in code, incl. a jailbroken planner.
- **Injection gauntlet** — 20 poisoned pages → 20/20 freeze, 0 instructions followed.
- **Isolation** — two clients, zero domain/cookie/counter bleed.
- **Kill switch** — engaged mid-form-fill → nothing submitted.
- Idempotency (a send fires at most once), content-sourced-destination approval,
  recipe matching, 90-day retention.

## Recipes (`recipes.js`)
chase_invoices · fill_form · pull_orders · research · download_reports ·
update_listing. Each declares where it parks; the loop still gates every action.
