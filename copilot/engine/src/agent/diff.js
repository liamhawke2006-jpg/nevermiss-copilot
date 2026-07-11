// AGENT MODE — approval diff. For a Tier-2 action, show the client WHAT CHANGED on
// the page (before vs after the fill/edit) so approving is informed, not blind.
// Line-level diff, no deps.
export function diffState(before = "", after = "") {
  const a = String(before).split("\n");
  const b = String(after).split("\n");
  const setA = new Set(a), setB = new Set(b);
  const removed = a.filter((l) => l.trim() && !setB.has(l));
  const added = b.filter((l) => l.trim() && !setA.has(l));
  return { added, removed, changed: added.length + removed.length };
}
