# NeverMiss Copilot — deployable bundle

Standalone, deploy-ready copy of the Copilot engine + console. Contains **no**
business/legal/client data — safe to push to GitHub and deploy.

- Engine + docs: [`copilot/engine`](copilot/engine/README.md)
- Console: `copilot/index.html` · Onboarding: `copilot/onboarding.html`

## Run locally
```bash
cd copilot/engine
node src/server.js            # http://localhost:3300/onboarding.html
npm test                      # 10 suites
```

## Deploy
```bash
docker build -f copilot/engine/Dockerfile -t nevermiss-copilot .
docker run -p 3300:3300 --env-file copilot/engine/.env nevermiss-copilot
```
`railway.json` / `render.yaml` included. Required env in production:
`COPILOT_SECRET_KEY`, `ANTHROPIC_API_KEY`, `COPILOT_OFFLINE=0` (+ `GOOGLE_*` and
`OAUTH_REDIRECT_BASE` for Gmail connect). Mount a persistent disk at
`copilot/engine/data`.
