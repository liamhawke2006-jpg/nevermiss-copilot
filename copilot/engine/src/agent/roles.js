// AGENT MODE — approval roles (c33). Higher-stakes Tier-2 actions can require a
// MANAGER, not just the owner. Ordinary sends need the owner; purchases/publishes
// need a manager sign-off. Enforced when an approval is submitted.
export function approvalRole(action = {}) {
  const t = String(action.type);
  if (/purchase|buy|pay/.test(t)) return "manager";
  if (t === "publish" || t === "post") return "manager";
  return "owner";
}
// A manager can approve anything; an owner can approve owner-level actions only.
export function canApprove(role, action = {}) {
  const need = approvalRole(action);
  if (role === "manager") return true;
  return need === "owner" && role === "owner";
}
