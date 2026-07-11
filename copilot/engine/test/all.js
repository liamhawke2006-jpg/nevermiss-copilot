import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  ["risk       (policy: safe=auto, world-changing=hold)", "test/risk.test.js"],
  ["safety     (nothing world-changing runs unapproved)", "test/safety.test.js"],
  ["agent      (live Claude loop obeys the gate, mocked)", "test/agent.test.js"],
  ["killswitch (disabled capability can't run)",           "test/killswitch.test.js"],
  ["engine     (sandbox + results + approve flow)",        "test/engine.test.js"],
  ["doer       (real SendGrid email send, mocked fetch)",  "test/doer.test.js"],
  ["browser    (Playwright read/click/fill, mocked page)", "test/browser.test.js"],
  ["provision  (multi-tenant isolation + connections)",    "test/provision.test.js"],
  ["secrets    (tenant secrets encrypted at rest)",        "test/secrets.test.js"],
  ["oauth      (Gmail connect flow + Gmail send doer)",    "test/oauth.test.js"],
  ["upgrades   (audit/TTL/cap/redact/idempotent/health)",  "test/upgrades.test.js"],
  ["agent-mode (gates/injection/isolation/killswitch)",    "test/agent-mode.test.js"],
  ["agent-hard (injection-v2/gate-v2/domains/alerts/lock)","test/agent-hardening.test.js"],
  ["agent-loop (PII shield/explain/stats/plan-preview)",   "test/agent-loop.test.js"],
  ["agent-live (real Chromium — skips until go-live flip)","test/agent-live.test.js"],
];
let failed = 0;
const t0 = Date.now();
for (const [label, file] of suites) {
  process.stdout.write(`\n▶ ${label}\n`);
  try { execSync(`node ${file}`, { cwd: root, stdio: "inherit", env: { ...process.env, COPILOT_OFFLINE: "1" } }); }
  catch { failed++; process.stdout.write(`\n✗ SUITE FAILED: ${file}\n`); }
}
console.log(`\n${"#".repeat(58)}`);
console.log(failed === 0 ? `# ✅ ALL SUITES PASSED (${((Date.now() - t0) / 1000).toFixed(1)}s)` : `# ❌ ${failed} SUITE(S) FAILED`);
console.log(`${"#".repeat(58)}\n`);
process.exit(failed ? 1 : 0);
