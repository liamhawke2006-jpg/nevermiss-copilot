// Multi-tenant provisioning. Each business is a tenant with its own settings,
// secrets, isolated workspace + data store. The onboarding form calls create();
// the server calls resolveConfig() to run the engine as that tenant.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config as base } from "./config.js";
import { seal, open } from "./secrets.js";

const slug = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "tenant";
const nowIso = () => new Date().toISOString();

export function openTenants(path = "data/tenants.json") {
  let data = existsSync(path) ? safeRead(path) : { seq: 0, tenants: [] };
  const persist = () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2)); };
  return {
    all: () => data.tenants,
    get: (id) => data.tenants.find((t) => t.id === id) || null,
    create(input) {
      const n = ++data.seq;
      const t = {
        id: `${slug(input.name)}-${n}`,
        name: input.name || "Business",
        mode: input.mode === "live" ? "live" : "demo",
        createdAt: nowIso(),
        settings: {
          autonomy: input.autonomy || "auto-safe-hold-world",
          capabilities: { files: true, shell: false, http: true, comms: true, browser: true, desktop: false, ...(input.capabilities || {}) },
        },
        secrets: seal({ sendgridKey: input.sendgridKey || "", mailFrom: input.mailFrom || "", anthropicKey: input.anthropicKey || "", gmailRefresh: "" }),
      };
      data.tenants.push(t); persist();
      return t;
    },
    update(id, patch) { const t = this.get(id); if (t) { Object.assign(t, patch); persist(); } return t; },
    // Store a connected Gmail refresh token (merged into the sealed secrets blob).
    connectGmail(id, refresh) {
      const t = this.get(id); if (!t) return null;
      const s = open(t.secrets); s.gmailRefresh = refresh || "";
      t.secrets = seal(s); persist(); return t;
    },
  };
}

// Decrypt a tenant's secrets (server-side only).
export const secretsOf = (tenant) => open(tenant.secrets);
function safeRead(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return { seq: 0, tenants: [] }; } }

// Turn a tenant into the config object the engine/tools consume.
export function resolveConfig(tenant) {
  const s = open(tenant.secrets);
  return {
    offline: tenant.mode !== "live",
    workspace: `workspace/${tenant.id}`,
    dbPath: `data/tenants/${tenant.id}.json`,
    autonomy: tenant.settings.autonomy,
    capabilities: tenant.settings.capabilities,
    // Fall back to the PLATFORM keys (NeverMiss's own env vars) so customers
    // never bring their own Anthropic/SendGrid key. A tenant can still override.
    anthropic: { key: s.anthropicKey || base.anthropic.key, model: base.anthropic.model },
    sendgrid: { key: s.sendgridKey || base.sendgrid.key, from: s.mailFrom || base.sendgrid.from },
    gmail: { refresh: s.gmailRefresh || "", clientId: base.google.clientId, clientSecret: base.google.clientSecret, redirectBase: base.google.redirectBase },
    browserHeadless: true,
  };
}

const FMT = { sendgrid: (k) => /^SG\./.test(k), anthropic: (k) => /^sk-ant/.test(k) };

// Validate a connected key. Offline = format check; live = a real probe (SendGrid).
export async function verifyKey(kind, key, { offline = true } = {}) {
  if (!key) return { ok: false, detail: "not provided" };
  if (!offline && kind === "sendgrid") {
    try { const r = await fetch("https://api.sendgrid.com/v3/scopes", { headers: { authorization: `Bearer ${key}` } });
      return { ok: r.ok, detail: r.ok ? "verified" : `rejected (${r.status})` }; }
    catch (e) { return { ok: false, detail: e.message }; }
  }
  const good = FMT[kind] ? FMT[kind](key) : true;
  return { ok: good, detail: good ? "saved" : "format looks off" };
}

// What's connected — drives the onboarding "you're all set" panel + console.
export function connections(tenant) {
  const c = tenant.settings.capabilities;
  const s = open(tenant.secrets);
  const on = (b) => (b ? "on" : "off");
  return {
    mode: tenant.mode,
    autonomy: tenant.settings.autonomy,
    brain: (s.anthropicKey || base.anthropic.key) ? "connected" : "off",
    email: (s.sendgridKey || base.sendgrid.key || s.gmailRefresh) ? "connected" : "off",
    gmail: s.gmailRefresh ? "connected" : "off",
    files: on(c.files), http: on(c.http), browser: on(c.browser), shell: on(c.shell), desktop: on(c.desktop),
  };
}

// Never leak secrets to the client.
export function publicTenant(tenant) {
  return { id: tenant.id, name: tenant.name, mode: tenant.mode, createdAt: tenant.createdAt, settings: tenant.settings, connections: connections(tenant) };
}
