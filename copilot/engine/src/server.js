// Copilot engine server — multi-tenant. Serves the onboarding form + console +
// brand assets, and a tenant-scoped API. A business onboards once, then its
// console/API run against its own isolated config + workspace + store.
//   GET  /onboarding.html         -> self-serve "connect your tools" form
//   POST /api/onboard             -> create a tenant, return its console link
//   GET  /?endpoint=/api/console&tenant=ID  -> that tenant's live console
//   GET  /api/console|tasks|pending|results   (?tenant=ID)
//   POST /api/assign|approve|deny             (?tenant=ID or body.tenant)
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as base } from "./config.js";
import { openStore } from "./store.js";
import { buildRegistry } from "./registry.js";
import { assign, run } from "./engine.js";
import { approve, deny, pending, expireStale } from "./approvals.js";
import { summary, consoleView } from "./results.js";
import { detailOf } from "./preview.js";
import { openTenants, resolveConfig, connections, verifyKey, publicTenant, selfTest } from "./provision.js";
import { gmailAuthUrl, gmailConfigured, exchangeCode, tenantFromState } from "./oauth.js";
import { auditLog } from "./audit.js";
import { healthPayload } from "./health.js";
import { createAgentService } from "./agent/service.js";

const STARTED_MS = Date.now();
const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE = join(here, "..", "..", "index.html");
const ONBOARD = join(here, "..", "..", "onboarding.html");
const AGENT = join(here, "..", "..", "agent.html");
const REPO = resolve(join(here, "..", "..", ".."));

const tenants = openTenants();
const cache = new Map(); // tenantId -> { config, registry, store }
const agentCache = new Map(); // tenantId -> Agent Mode service (per client)
function agentFor(tenantId) {
  const c = ctxFor(tenantId);
  if (!c) return null;
  const key = tenantId || "_legacy";
  if (!agentCache.has(key)) agentCache.set(key, createAgentService({ store: c.store, config: c.config }));
  return agentCache.get(key);
}
function ctxFor(tenantId) {
  if (!tenantId) return { config: base, registry: buildRegistry(base), store: openStore(base.dbPath) }; // legacy single-tenant
  const t = tenants.get(tenantId);
  if (!t) return null;
  if (!cache.has(tenantId)) { const config = resolveConfig(t); cache.set(tenantId, { config, registry: buildRegistry(config), store: openStore(config.dbPath) }); }
  return cache.get(tenantId);
}

// Shape a stored step into what the live "watch it work" panel renders.
const DOMAIN_ICON = { files: "📁", comms: "✉️", http: "🌐", shell: "⌘", browser: "🧭", desktop: "🖥️" };
function stepView(s) {
  const domain = String(s.tool || "").split(".")[0];
  return {
    seq: s.seq,
    icon: DOMAIN_ICON[domain] || "•",
    app: domain.toUpperCase(),
    label: s.why || s.tool,
    status: s.status,        // done | held | error | blocked
    decision: s.decision,    // auto | hold | error | blocked
    risk: s.risk,
    detail: s.status === "error" ? ((s.result && s.result.error) || "error")
          : s.decision === "hold" ? "held — waiting for your approval"
          : s.status === "done" ? "done" : (s.status || ""),
  };
}

const CT = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ico": "image/x-icon" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", ...CORS }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });
function serveFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: "not found" });
  res.writeHead(200, { "content-type": CT[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const body = req.method === "POST" ? await readBody(req) : {};
    const tid = url.searchParams.get("tenant") || body.tenant || "";

    // ---- onboarding ----
    if (req.method === "POST" && p === "/api/onboard") {
      // Invite-only gate: if a signup code is configured, require a match.
      if (base.signupCode && String(body.code || "").trim() !== base.signupCode) {
        return json(res, 403, { error: "That invite code isn't valid. Ask NeverMiss for your code." });
      }
      const t = tenants.create(body);
      const off = resolveConfig(t).offline;
      const verify = {
        email: await verifyKey("sendgrid", t.secrets.sendgridKey, { offline: off }),
        brain: await verifyKey("anthropic", t.secrets.anthropicKey, { offline: off }),
      };
      return json(res, 200, { tenant: publicTenant(t), verify, consoleUrl: `/?endpoint=/api/console&tenant=${t.id}&name=${encodeURIComponent(t.name)}` });
    }
    if (req.method === "GET" && p === "/api/config") return json(res, 200, { gmailAvailable: gmailConfigured(base.google), signupRequired: !!base.signupCode });
    if (req.method === "GET" && p === "/api/tenants") return json(res, 200, tenants.all().map(publicTenant));

    // ---- Gmail OAuth ----
    if (req.method === "GET" && p === "/api/oauth/gmail/start") {
      const t = tenants.get(tid);
      if (!t) return json(res, 404, { error: "unknown tenant" });
      try { const { url } = gmailAuthUrl(t.id, resolveConfig(t).gmail); res.writeHead(302, { location: url }); return res.end(); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method === "GET" && p === "/api/oauth/gmail/callback") {
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      const t = tenants.get(tenantFromState(state));
      if (!t) return json(res, 400, { error: "bad state" });
      try {
        const tok = await exchangeCode(code, resolveConfig(t).gmail);
        tenants.connectGmail(t.id, tok.refresh_token);
        cache.delete(t.id); // rebuild config with the new secret
        res.writeHead(302, { location: `/?endpoint=/api/console&tenant=${t.id}&gmail=connected` });
        return res.end();
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method === "GET" && p === "/api/tenant") { const t = tenants.get(tid); return t ? json(res, 200, publicTenant(t)) : json(res, 404, { error: "unknown tenant" }); }

    // ---- tenant-scoped engine API ----
    const c = ctxFor(tid);
    if (tid && !c) return json(res, 404, { error: "unknown tenant" });
    // U3 — lazily expire any world-changing action that sat unapproved past the TTL.
    if (c) expireStale(c.store, c.config.heldTtlMin);
    if (req.method === "GET" && p === "/api/health") return json(res, 200, healthPayload(c.config, c.store, { startMs: STARTED_MS }));
    if (req.method === "GET" && p === "/api/audit") return json(res, 200, { audit: auditLog(c.store, { taskId: url.searchParams.get("task") ? Number(url.searchParams.get("task")) : null }) });
    if (req.method === "GET" && p === "/api/selftest") { const t = tenants.get(tid); return t ? json(res, 200, await selfTest(t)) : json(res, 200, { mode: "legacy", ready: !c.config.offline, checks: {} }); }
    if (req.method === "GET" && p === "/api/console") return json(res, 200, consoleView(c.store));
    if (req.method === "GET" && p === "/api/results") return json(res, 200, summary(c.store));
    if (req.method === "GET" && p === "/api/tasks") return json(res, 200, c.store.all("tasks"));
    if (req.method === "GET" && p === "/api/pending") return json(res, 200, pending(c.store));
    if (req.method === "GET" && p === "/api/registry") return json(res, 200, { capabilities: c.config.capabilities, autonomy: c.config.autonomy, tools: c.registry.list() });
    if (req.method === "POST" && p === "/api/assign") {
      const t = assign(c.store, body.prompt);
      // Run in the BACKGROUND so the client can watch steps land live via /api/task.
      run(c.store, t.id, { config: c.config, registry: c.registry })
        .catch((e) => { c.store.update("tasks", t.id, { status: "failed" }); c.store.event(t.id, "error", `Run failed: ${e.message}`); });
      return json(res, 200, { task: t });
    }
    if (req.method === "GET" && p === "/api/task") {
      const id = Number(url.searchParams.get("id"));
      const t = c.store.get("tasks", id);
      if (!t) return json(res, 404, { error: "unknown task" });
      const steps = c.store.where("steps", (s) => s.task_id === id).map(stepView);
      const held = c.store.where("held", (h) => h.task_id === id && h.status === "pending")
        .map((h) => ({ heldId: h.id, tool: h.tool, risk: h.risk, preview: h.preview, why: h.why, detail: detailOf(h.tool, h.args) }));
      const running = t.status === "assigned" || t.status === "running";
      return json(res, 200, { id, status: t.status, running, prompt: t.prompt, steps, held });
    }
    if (req.method === "POST" && p === "/api/approve") { return json(res, 200, await approve(c.store, Number(body.id), { config: c.config, registry: c.registry })); }
    if (req.method === "POST" && p === "/api/deny") { return json(res, 200, deny(c.store, Number(body.id), body.reason)); }

    // ---- Agent Mode (server-side web automation) ----
    // Browser execution is LIVE-gated: assign returns { status:"browser_unavailable" }
    // until Playwright is installed + AGENT_BROWSER_LIVE=1. All gates run regardless.
    if (p.startsWith("/api/agent/")) {
      const svc = agentFor(tid); if (!svc) return json(res, 404, { error: "unknown tenant" });
      const client = tid || "_legacy";
      if (req.method === "POST" && p === "/api/agent/preview") return json(res, 200, svc.preview(body.prompt)); // Plan Preview — no execution
      if (req.method === "GET" && p === "/api/agent/stats") return json(res, 200, svc.stats(client));
      if (req.method === "POST" && p === "/api/agent/assign") return json(res, 200, await svc.assign(client, body.prompt));
      if (req.method === "POST" && p === "/api/agent/approve") return json(res, 200, await svc.approve(client, body.taskId));
      if (req.method === "POST" && p === "/api/agent/deny") return json(res, 200, svc.deny(client, body.taskId, body.reason));
      if (req.method === "POST" && p === "/api/agent/kill") return json(res, 200, body.global ? svc.killGlobal() : svc.kill(client));
      if (req.method === "POST" && p === "/api/agent/unkill") return json(res, 200, svc.unkill(client));
      if (req.method === "POST" && p === "/api/agent/domain") return json(res, 200, svc.allowDomain(client, body.domain));
      if (req.method === "GET" && p === "/api/agent/alerts") return json(res, 200, { alerts: c.store.where("events", (e) => e.type === "agent_alert").slice(-50).reverse() });
      if (req.method === "GET" && p === "/api/agent/sessions") return json(res, 200, { sessions: svc.sessions(client) });
      if (req.method === "GET" && p === "/api/agent/session") return json(res, 200, svc.session(url.searchParams.get("id")) || { error: "not found" });
      if (req.method === "GET" && p === "/api/agent/replay") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(svc.replay(url.searchParams.get("id"))); }
      if (req.method === "GET" && p === "/api/agent/export") { const e = svc.exportOne(url.searchParams.get("id")); res.writeHead(200, { "content-type": "application/json", "content-disposition": `attachment; filename="${e.filename}"` }); return res.end(e.json); }
      if (req.method === "GET" && p === "/api/agent/client") return json(res, 200, svc.clientView(client));
    }

    // ---- static ----
    if (req.method === "GET" && (p === "/onboarding.html" || p === "/onboard" || p === "/connect")) return serveFile(res, ONBOARD);
    if (req.method === "GET" && (p === "/agent" || p === "/agent.html")) return serveFile(res, AGENT);
    if (req.method === "GET" && (p === "/" || p === "/index.html")) return serveFile(res, CONSOLE);
    if (req.method === "GET" && p.startsWith("/brand/") && !p.includes("..")) return serveFile(res, join(REPO, p));
    json(res, 404, { error: "not found" });
  } catch (e) { json(res, 400, { error: e.message }); }
}).listen(base.port, () => {
  console.log(`Copilot onboarding → http://localhost:${base.port}/onboarding.html`);
  console.log(`   console (legacy) → http://localhost:${base.port}/?endpoint=/api/console`);
});
