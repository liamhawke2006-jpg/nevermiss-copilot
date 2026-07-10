// Engine end-to-end: sandbox is enforced, safe steps run, results aggregate.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkEnv } from "./helpers.js";
import { assign, run } from "../src/engine.js";
import { approve, pending } from "../src/approvals.js";
import { summary } from "../src/results.js";

// files tool refuses to escape the workspace sandbox
{
  const { config, store, registry } = mkEnv();
  const filesRead = registry.get("files.read");
  await assert.rejects(
    Promise.resolve().then(() => filesRead.run({ file: "../../etc/passwd" }, { workspace: config.workspace })),
    /escapes workspace/
  );
}

// summarize task: pure read, no held actions, counts time saved
{
  const { config, store, registry } = mkEnv();
  const t = assign(store, "summarize notes.md");
  const r = await run(store, t.id, { config, registry });
  assert.equal(r.status, "done");
  assert.equal(r.held, 0);
  assert.ok(summary(store).minutesSaved >= 12);
}

// backup task: write is held, then approved creates the file
{
  const { ws, config, store, registry } = mkEnv();
  const t = assign(store, "back up the workspace");
  await run(store, t.id, { config, registry });
  assert.ok(!existsSync(join(ws, "backups", "snapshot.txt")), "write held, not yet written");
  await approve(store, pending(store)[0].id, { config, registry });
  assert.ok(existsSync(join(ws, "backups", "snapshot.txt")), "approved write created the file");
}

console.log("✓ engine");
