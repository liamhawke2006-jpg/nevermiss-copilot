// File tools — real, but sandboxed to the workspace root. Reads/lists are safe;
// writes/deletes are world-changing (held for approval by policy).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, statSync, existsSync } from "node:fs";
import { resolve, sep, dirname } from "node:path";
import { RISK } from "../risk.js";

function safe(workspace, rel) {
  const root = resolve(workspace);
  const p = resolve(root, rel || ".");
  if (!(p === root || p.startsWith(root + sep))) throw new Error(`path escapes workspace: ${rel}`);
  return p;
}

export default [
  {
    id: "files.list", domain: "files", risk: RISK.READ,
    description: "List files in a workspace directory",
    run: ({ dir = "." }, ctx) => {
      const p = safe(ctx.workspace, dir);
      if (!existsSync(p)) return { dir, entries: [] };
      return { dir, entries: readdirSync(p).map((n) => ({ name: n, dir: statSync(safe(ctx.workspace, `${dir}/${n}`)).isDirectory() })) };
    },
  },
  {
    id: "files.read", domain: "files", risk: RISK.READ,
    description: "Read a text file",
    run: ({ file }, ctx) => {
      const p = safe(ctx.workspace, file);
      const text = readFileSync(p, "utf8");
      return { file, bytes: text.length, text: text.slice(0, 4000) };
    },
  },
  {
    id: "files.write", domain: "files", risk: RISK.WRITE,
    description: "Create or overwrite a file",
    run: ({ file, content = "" }, ctx) => {
      const p = safe(ctx.workspace, file);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      return { file, wrote: content.length };
    },
  },
  {
    id: "files.delete", domain: "files", risk: RISK.DELETE,
    description: "Delete a file or folder",
    run: ({ file }, ctx) => {
      const p = safe(ctx.workspace, file);
      rmSync(p, { recursive: true, force: true });
      return { file, deleted: true };
    },
  },
];
