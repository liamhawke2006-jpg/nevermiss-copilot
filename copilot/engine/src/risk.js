// The safety spine. Every tool declares a risk level; the autonomy policy maps it
// to a decision: run it now (auto) or hold it for a human (hold).

// READ is the only "safe" class. Everything else changes the world.
export const RISK = {
  READ: "read",     // list, read, fetch, observe — reversible, no side effects
  WRITE: "write",   // create/modify a file or record
  DELETE: "delete", // remove data
  SEND: "send",     // email, HTTP POST, message — leaves the building
  PAY: "pay",       // moves money
  POST: "post",     // publishes publicly (social, Slack)
  EXEC: "exec",     // arbitrary shell / desktop control
};

export const WORLD_CHANGING = new Set([RISK.WRITE, RISK.DELETE, RISK.SEND, RISK.PAY, RISK.POST, RISK.EXEC]);

export function isSafe(risk) {
  return risk === RISK.READ;
}

// Returns 'auto' (run now) or 'hold' (needs approval) for a given risk + policy.
export function decide(risk, autonomy = "auto-safe-hold-world") {
  switch (autonomy) {
    case "full-auto":
      return "auto";
    case "approve-everything":
      return "hold";
    case "auto-safe-hold-world":
    default:
      return isSafe(risk) ? "auto" : "hold";
  }
}
