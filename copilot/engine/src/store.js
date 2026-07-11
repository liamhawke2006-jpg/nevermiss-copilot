// Tiny JSON-backed store — no native deps, runs with plain Node. Persists so you
// can assign in one command and approve in another. Use openMemory() for tests.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

function blank() {
  return { seq: 0, tasks: [], steps: [], held: [], events: [] };
}

export function openStore(path) {
  let data = blank();
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, "utf8")); } catch { data = blank(); }
  }
  const persist = () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2)); };
  return makeApi(data, persist);
}

export function openMemory() {
  return makeApi(blank(), () => {});
}

function makeApi(data, persist) {
  const id = () => ++data.seq;
  const col = (c) => (data[c] = data[c] || []); // lazily init any collection (schema-flexible)
  const api = {
    _data: data,
    insert(coll, row) { const r = { id: id(), ...row }; col(coll).push(r); persist(); return r; },
    update(coll, rowId, patch) {
      const r = col(coll).find((x) => x.id === rowId);
      if (r) { Object.assign(r, patch); persist(); }
      return r;
    },
    get(coll, rowId) { return col(coll).find((x) => x.id === rowId) || null; },
    where(coll, pred) { return col(coll).filter(pred); },
    all(coll) { return col(coll); },
    event(taskId, type, summary, meta = {}) {
      return api.insert("events", { ts: nowIso(), task_id: taskId ?? null, type, summary, meta });
    },
  };
  return api;
}

export function nowIso() {
  // Deterministic-safe: build from Date only where allowed; tests pass explicit ts.
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
