// Browser + desktop tools.
//   browser.*  — REAL automation via Playwright (self-contained, no OAuth).
//                read (auto) navigates + reads text; act (held) clicks/fills/goes.
//   desktop.*  — computer-use, still a simulated stub (needs the MCP + a grant).
// OFFLINE simulates everything. The Playwright page is injectable via ctx.page so
// this is unit-testable with no browser install.
import { RISK } from "../risk.js";

let _browser = null, _page = null;
async function getPage(ctx) {
  if (ctx.page) return ctx.page; // injected (tests / custom session)
  if (!_page) {
    const { chromium } = await import("playwright");
    _browser = await chromium.launch({ headless: ctx.config?.browserHeadless !== false });
    _page = await _browser.newPage();
  }
  return _page;
}
export async function closeBrowser() { if (_browser) { await _browser.close(); _browser = null; _page = null; } }

export default [
  {
    id: "browser.read", domain: "browser", risk: RISK.READ,
    description: "Open a page and read its text",
    run: async ({ url, selector }, ctx) => {
      if (ctx.offline) return { url, selector, simulated: true, text: "(offline) page text would be read here" };
      const p = await getPage(ctx);
      if (url) await p.goto(url, { waitUntil: "domcontentloaded" });
      const text = await p.innerText(selector || "body");
      return { url, selector: selector || "body", text: String(text).slice(0, 4000) };
    },
  },
  {
    id: "browser.act", domain: "browser", risk: RISK.POST,
    description: "Act on a web page: click / fill / goto",
    run: async ({ action, selector, value }, ctx) => {
      if (ctx.offline) return { action, selector, simulated: true };
      const p = await getPage(ctx);
      if (action === "click") await p.click(selector);
      else if (action === "fill") await p.fill(selector, value ?? "");
      else if (action === "goto") await p.goto(value, { waitUntil: "domcontentloaded" });
      else throw new Error(`browser.act: unknown action "${action}"`);
      return { action, selector, done: true };
    },
  },
  {
    id: "desktop.observe", domain: "desktop", risk: RISK.READ,
    description: "Screenshot / read the desktop",
    run: (_args, ctx) => {
      if (ctx.offline) return { simulated: true, note: "(offline) screenshot would be taken here" };
      throw new Error("desktop.observe not wired (connect computer-use MCP: screenshot).");
    },
  },
  {
    id: "desktop.act", domain: "desktop", risk: RISK.EXEC,
    description: "Control the desktop — click, type, open apps",
    run: ({ action }, ctx) => {
      if (ctx.offline) return { action, simulated: true };
      throw new Error("desktop.act not wired (connect computer-use MCP: request_access + click/type).");
    },
  },
];
