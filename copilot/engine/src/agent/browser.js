// AGENT MODE — browser adapter. Real control uses Playwright (Chromium) with a
// PER-CLIENT persistent profile so cookies/logins are isolated and survive between
// tasks. LIVE is gated behind review + install; tests inject a fake `page`.
//
// Going live:  npm i playwright && npx playwright install chromium
//              then set AGENT_BROWSER_LIVE=1 after reviewing this adapter.
export const AGENT_BROWSER_LIVE = process.env.AGENT_BROWSER_LIVE === "1";

// Launch an isolated context for one client. launchPersistentContext keeps that
// client's cookies in their own profileDir — no shared state, no cross-client bleed.
export async function launchProfile(profileDir, { headless = true } = {}) {
  if (!AGENT_BROWSER_LIVE) throw new Error("agent browser not live — review this adapter, install Playwright, set AGENT_BROWSER_LIVE=1");
  const { chromium } = await import("playwright");
  const ctx = await chromium.launchPersistentContext(profileDir, { headless });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page, close: () => ctx.close() };
}

// Observation each step: URL + visible text + raw html (for injection scan) +
// accessibility tree + a screenshot. Defensive against a page that throws.
export async function observe(page) {
  const safe = async (fn, d) => { try { return await fn(); } catch { return d; } };
  return {
    url: await safe(() => page.url(), ""),
    text: await safe(() => page.evaluate(() => document.body.innerText), ""),
    html: await safe(() => page.content(), ""),
    axtree: await safe(() => page.accessibility.snapshot(), null),
    screenshot: await safe(async () => (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64"), null),
  };
}

// Perform a single action. Only ever called by the loop AFTER gating (Tier 1) or
// AFTER human approval (Tier 2). This adapter does NOT decide safety.
export async function act(page, action = {}) {
  switch (String(action.type)) {
    case "navigate": case "goto": return page.goto(action.url, { waitUntil: "domcontentloaded" });
    case "back": return page.goBack();
    case "click": case "press": return page.click(action.selector);
    case "fill": case "type": case "input": return page.fill(action.selector, String(action.value ?? ""));
    case "submit": return page.click(action.selector || "button[type=submit]");
    case "download": return page.click(action.selector);
    case "scroll": return page.mouse.wheel(0, action.dy || 600);
    case "wait": return page.waitForTimeout(Math.min(action.ms || 500, 5000));
    default: throw new Error(`unsupported browser action "${action.type}"`);
  }
}

// The supervised takeover: for login, the CLIENT drives in a live window. Copilot
// never sees, types, or stores credentials — it just hands control over and waits
// for the session cookie to land in the isolated profile.
export function takeoverHandoff(profileDir, loginUrl) {
  return {
    kind: "supervised_takeover",
    message: "Log in yourself in the window that opens — Copilot never sees your password. Your session is saved to your private profile afterward.",
    loginUrl, profileDir,
  };
}
