# NeverMiss Copilot — Engine

The doer behind the Copilot results console. Assign a task in plain English; it
plans the task, runs the **safe** steps itself, and **holds every world-changing
action** (send / pay / delete / post / write / exec) until a human approves.

> "Can do anything on the computer if assigned" — implemented as a **tool registry**
> (one agent, modular capabilities) + a **risk policy** (the safety spine). It is not
> literally unbounded: capabilities have kill switches, files/shell are sandboxed to
> a workspace, and nothing that changes the world runs without approval.

Runs with **plain Node ≥20, no dependencies** (JSON store, offline adapters).

```bash
node src/cli.js demo                     # seed + assign 4 tasks, watch the gate
node src/cli.js assign "chase overdue invoices in invoices.csv"
node src/cli.js pending                  # actions waiting on you
node src/cli.js approve <id>             # run a held action for real
node src/cli.js deny <id>                # cancel it
node src/cli.js results                  # hours saved, tasks done, pending
node src/server.js                       # HTTP API for the console
npm test                                 # safety + kill-switch + engine suites
```

## How it decides (the whole safety model)
| Risk | Examples | Default |
|------|----------|---------|
| `read` | list, read, fetch, observe, screenshot | **auto-run** |
| `write` `delete` `send` `pay` `post` `exec` | write/delete a file, email, HTTP POST, Slack, run shell, control desktop | **held for approval** |

Policy is configurable (`COPILOT_AUTONOMY`): `auto-safe-hold-world` (default),
`approve-everything`, or `full-auto`.

## Capabilities (kill switches via `CAP_*` env)
| Domain | Tools | Live wiring point |
|--------|-------|-------------------|
| files | list/read (auto), write/delete (held) | real, sandboxed to `workspace/` |
| shell | read allowlisted (auto), exec (held) | real, runs in `workspace/` |
| http | get (auto), post (held) | real `fetch` |
| comms | email / slack (held) | SendGrid / Slack |
| browser | read (auto), act (held) | **real via Playwright** (`npm i playwright`) |
| desktop | observe (auto), act (held) | computer-use MCP (stub) |

## Guarantees (covered by `npm test`)
- A world-changing action **never executes** until `approve()`. Verified by deleting/writing real files.
- **Deny** means it never runs, and can't be re-triggered.
- A **disabled capability** is blocked — not held, not run.
- File/shell tools **refuse to escape** the workspace sandbox.

## The brain (live agent)
`agent.js` is a real **Claude tool-use loop**: it reasons step by step, actually
runs READ tools and feeds results back, and **queues every world-changing tool for
approval** instead of running it. `engine.run` routes to it automatically when a key
(or an injected client) is present; otherwise it uses the offline heuristic planner.
The loop is unit-tested with a **mock client** (`test/agent.test.js`) — no key needed
to prove the gate holds with the model driving.

```bash
npm i @anthropic-ai/sdk                 # only needed for live mode
COPILOT_OFFLINE=0 ANTHROPIC_API_KEY=sk-... node src/cli.js assign "reconcile last month and draft the follow-ups"
```

## First real doer — email (SendGrid)
`comms.email` actually sends via SendGrid when live (API key only, **no OAuth** — so
it works headless). An approved "Send email" on the console really goes out; while
held, nothing sends. Proven end-to-end in `test/doer.test.js` (held → approve → SENT,
mocked fetch).
```bash
SENDGRID_API_KEY=SG... MAIL_FROM=you@biz.com COPILOT_OFFLINE=0 node src/server.js
```
Gmail/Slack/Google are swap-in doers, but their connectors need an interactive OAuth
login — connect them via claude.ai settings or `/mcp`, then point the adapter at them.

## Browser doer (Playwright)
`browser.read` (auto) navigates + reads page text; `browser.act` (held) clicks / fills
/ navigates. Real, self-contained, no OAuth. Unit-tested with an injected page
(`test/browser.test.js`). Activate:
```bash
npm i playwright && npx playwright install chromium
COPILOT_OFFLINE=0 node src/server.js
```

## Onboarding & multi-tenant
Each business is a **tenant** with its own settings, secrets, isolated `workspace/<id>`
and data store (`src/provision.js`). Self-serve form at `/onboarding.html`: name → demo/live
→ capabilities → autonomy → paste keys → **You're connected** → console link. Tenant
secrets are **encrypted at rest** (AES-256-GCM, key from `COPILOT_SECRET_KEY`). API is
tenant-scoped via `?tenant=ID`.

## Gmail connect (OAuth)
Real send-only Gmail flow (`src/oauth.js` + `comms.gmail`): `/api/oauth/gmail/start` →
Google consent → `/api/oauth/gmail/callback` stores a per-tenant refresh token → the
`comms.gmail` doer trades it for an access token and sends. Enable by setting
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE` and registering
`<base>/api/oauth/gmail/callback` in Google Cloud. The onboarding "Connect Gmail" button
appears automatically once configured.

## Deploy
```bash
# from the repo root
docker build -f copilot/engine/Dockerfile -t nevermiss-copilot .
docker run -p 3300:3300 --env-file copilot/engine/.env nevermiss-copilot
```
`railway.json` / `render.yaml` are included (Docker service + a persistent disk mounted at
`copilot/engine/data`). The server binds `PORT` (Railway/Render) automatically. Set at
minimum: `COPILOT_SECRET_KEY`, `ANTHROPIC_API_KEY`, and — for real actions — `COPILOT_OFFLINE=0`.

## What's real vs. stub
Real: safety gate, agent (Claude), email (SendGrid), browser (Playwright), multi-tenant
onboarding, encrypted secrets, Gmail OAuth. Stub: desktop control (computer-use MCP) and
Slack. The risk policy and approval gate are unchanged — turning on real capabilities never
turns off the guardrails.
