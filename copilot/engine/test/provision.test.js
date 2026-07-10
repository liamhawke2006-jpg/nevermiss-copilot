// Multi-tenant provisioning: tenants are isolated, config resolves per tenant,
// secrets never leak, connections reflect what was provided.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTenants, resolveConfig, connections, publicTenant, verifyKey } from "../src/provision.js";

const reg = openTenants(join(mkdtempSync(join(tmpdir(), "tenants-")), "tenants.json"));

const a = reg.create({ name: "Greenline Distribution", mode: "live", autonomy: "auto-safe-hold-world", capabilities: { shell: true }, sendgridKey: "SG.abc", mailFrom: "ops@greenline.com", anthropicKey: "sk-ant-xyz" });
const b = reg.create({ name: "Greenline Distribution" }); // same name → distinct id

assert.notEqual(a.id, b.id, "same name still gets a unique tenant id");
assert.equal(reg.get(a.id).name, "Greenline Distribution");

// isolated config + workspace + store paths
const ca = resolveConfig(a), cb = resolveConfig(b);
assert.notEqual(ca.dbPath, cb.dbPath);
assert.notEqual(ca.workspace, cb.workspace);
assert.equal(ca.offline, false, "live tenant runs live");
assert.equal(cb.offline, true, "default tenant is demo/offline");
assert.equal(ca.sendgrid.key, "SG.abc");
assert.equal(ca.capabilities.shell, true);
assert.equal(cb.capabilities.shell, false, "shell defaults off");

// connections reflect what was connected
const conn = connections(a);
assert.equal(conn.email, "connected");
assert.equal(conn.brain, "connected");
assert.equal(connections(b).email, "off");

// secrets never leak to the client shape
const pub = publicTenant(a);
assert.equal(pub.secrets, undefined, "publicTenant hides secrets");
assert.ok(pub.connections);

// verify (offline = format check)
assert.equal((await verifyKey("sendgrid", "SG.abc", { offline: true })).ok, true);
assert.equal((await verifyKey("sendgrid", "nope", { offline: true })).ok, false);
assert.equal((await verifyKey("anthropic", "", { offline: true })).ok, false);

console.log("✓ provision");
