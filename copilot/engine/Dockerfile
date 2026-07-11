# NeverMiss Copilot engine.
# Build from the REPO ROOT so it can pull in the console + brand assets:
#   docker build -f copilot/engine/Dockerfile -t nevermiss-copilot .
#   docker run -p 3300:3300 --env-file copilot/engine/.env nevermiss-copilot
FROM node:20-slim
WORKDIR /app

# Install deps first (better layer caching). Only package.json is needed here.
COPY copilot/engine/package.json ./copilot/engine/
RUN cd copilot/engine && npm install --omit=optional --no-audit --no-fund

# App — mirror the repo layout so the server's relative paths resolve
# (console at ../../index.html, brand at ../../../brand).
COPY copilot/engine ./copilot/engine
COPY copilot/index.html copilot/onboarding.html copilot/agent.html copilot/agent-dashboard.html ./copilot/
COPY brand ./brand

WORKDIR /app/copilot/engine
ENV NODE_ENV=production COPILOT_OFFLINE=0
EXPOSE 3300
CMD ["node", "src/server.js"]
