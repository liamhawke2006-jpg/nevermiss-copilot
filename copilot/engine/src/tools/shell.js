// Shell tools. shell.read only runs read-only, allowlisted commands (auto).
// shell.exec runs arbitrary commands in the workspace — pure "do anything",
// so it is EXEC risk and always held for approval.
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { RISK } from "../risk.js";

const SAFE = new Set(["ls", "cat", "head", "tail", "wc", "grep", "find", "git", "echo", "pwd", "date", "du", "stat", "sort", "uniq"]);

function run(cmd, workspace) {
  return execSync(cmd, { cwd: resolve(workspace), timeout: 20000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
}

export default [
  {
    id: "shell.read", domain: "shell", risk: RISK.READ,
    description: "Run a read-only, allowlisted shell command",
    run: ({ cmd }, ctx) => {
      const bin = String(cmd).trim().split(/\s+/)[0];
      if (!SAFE.has(bin)) throw new Error(`shell.read refuses non-allowlisted command: ${bin} (use shell.exec, which is held for approval)`);
      if (/[;&|`$><]/.test(cmd)) throw new Error("shell.read refuses shell metacharacters");
      return { cmd, out: run(cmd, ctx.workspace).slice(0, 4000) };
    },
  },
  {
    id: "shell.exec", domain: "shell", risk: RISK.EXEC,
    description: "Run an arbitrary shell command in the workspace",
    run: ({ cmd }, ctx) => {
      if (ctx.offline && ctx.simulate) return { cmd, simulated: true };
      return { cmd, out: run(cmd, ctx.workspace).slice(0, 4000) };
    },
  },
];
