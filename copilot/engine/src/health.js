// Upgrade 7 — health/status. A read-only snapshot for monitoring + a quick "is the
// brain live, which capabilities are on, how many actions are waiting" check.
export const VERSION = "1.1.0";

export function healthPayload(config, store, { startMs = 0, nowMs = Date.now() } = {}) {
  const held = store.all("held");
  return {
    ok: true,
    version: VERSION,
    mode: config.offline ? "demo" : "live",
    offline: !!config.offline,
    autonomy: config.autonomy,
    capabilities: config.capabilities,
    brain: config.anthropic && config.anthropic.key ? "configured" : "off",
    email: config.sendgrid && config.sendgrid.key ? "sendgrid" : (config.gmail && config.gmail.refresh ? "gmail" : "off"),
    limits: { maxSendsPerDay: config.maxSendsPerDay || 0, heldTtlMin: config.heldTtlMin || 0 },
    pending: held.filter((h) => h.status === "pending").length,
    tasks: store.all("tasks").length,
    uptimeSec: startMs ? Math.max(0, Math.round((nowMs - startMs) / 1000)) : null,
  };
}
