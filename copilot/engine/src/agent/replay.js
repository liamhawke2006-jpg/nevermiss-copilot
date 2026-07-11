// AGENT MODE — session replay engine (flagship) + structured export. Turns a
// recorded session into a self-contained HTML timeline the client (or an auditor)
// can replay like a security camera: every step, its gate decision, the plain-
// English explanation, PII/injection flags, and the screenshot. Also exports the
// session as portable JSON for compliance. Everything is secret-redacted.
import { redact } from "../redact.js";

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const TIER = { 1: ["auto", "#37D392"], 2: ["pause · approval", "#E5B457"], 3: ["refused", "#F0685E"] };

// Cycle 7 — portable JSON export (redacted) for compliance / hand-off.
export function exportSession(session = {}) {
  const s = redact(session);
  return { filename: `agent-session-${session.taskId || "x"}.json`, json: JSON.stringify(s, null, 2) };
}

// Flagship — a self-contained HTML replay of one session.
export function buildReplay(session = {}) {
  const steps = session.steps || [];
  const counts = {
    auto: steps.filter((x) => x.decision === "auto").length,
    pause: steps.filter((x) => x.decision === "hold").length,
    blocked: steps.filter((x) => x.decision === "blocked").length,
    pii: steps.filter((x) => x.event === "pii_redacted").length,
    injection: steps.filter((x) => x.event === "injection_freeze").length,
  };
  const rows = steps.map((st) => {
    if (st.event === "injection_freeze") return band("#F0685E", "⚠ FROZEN — prompt injection", (st.evidence || []).map(esc).join("<br>"));
    if (st.event === "pii_redacted") return band("#33B7CC", "🛡 PII shielded from the model", esc(st.note || ""));
    if (!st.action) return band("#7C918A", esc(st.event || "step"), esc(st.note || ""));
    const [label, color] = TIER[st.tier] || ["", "#7C918A"];
    const a = redact(st.action);
    const line = a.to ? `${esc(a.type)} → ${esc(a.to)}${a.subject ? ` · “${esc(a.subject)}”` : ""}` : a.url ? `${esc(a.type)} → ${esc(a.url)}` : a.selector ? `${esc(a.type)} · ${esc(a.selector)}` : esc(a.type);
    const shot = st.screenshot ? `<img src="data:image/jpeg;base64,${st.screenshot}" style="width:120px;border-radius:6px;border:1px solid #213029">` : `<div style="width:120px;height:70px;border-radius:6px;border:1px solid #213029;display:grid;place-items:center;color:#7C918A;font:9px monospace">no shot</div>`;
    return `<div style="display:flex;gap:12px;padding:12px 0;border-top:1px solid #213029">${shot}
      <div><div style="font-weight:600">${line} <span style="font:700 9px monospace;color:${color};background:${color}22;padding:3px 7px;border-radius:6px;margin-left:6px">${label}</span></div>
      <div style="color:#AEC0B8;font-size:12.5px;margin-top:3px">${esc(st.reason || st.explain || st.note || "")}</div>
      <div style="color:#7C918A;font-size:11px;font-family:monospace;margin-top:2px">${esc(st.ts || "")}</div></div></div>`;
  }).join("");

  return `<!doctype html><meta charset="utf8"><title>Replay · task ${esc(session.taskId)}</title>
<div style="max-width:820px;margin:0 auto;padding:28px;background:#0A0F0D;color:#E9F1EE;font:14px/1.5 -apple-system,Inter,system-ui,sans-serif">
<div style="font:700 11px monospace;letter-spacing:.14em;text-transform:uppercase;color:#33B7CC">Session replay</div>
<h2 style="margin:4px 0">${esc(session.assignment || "Task")}</h2>
<div style="color:#7C918A;font-family:monospace;font-size:12px">client ${esc(session.clientId)} · status ${esc(session.status)} · ${esc(session.startedAt || "")}</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
  ${chip("#37D392", `${counts.auto} auto`)}${chip("#E5B457", `${counts.pause} pauses`)}${chip("#F0685E", `${counts.blocked} refused`)}${chip("#33B7CC", `${counts.pii} PII shielded`)}${counts.injection ? chip("#F0685E", `${counts.injection} injection freeze`) : ""}
</div>
${rows || '<div style="color:#7C918A">No steps recorded.</div>'}
</div>`;
}

function chip(c, t) { return `<span style="font:700 10px monospace;color:${c};background:${c}1f;padding:5px 10px;border-radius:999px">${esc(t)}</span>`; }
function band(c, title, body) {
  return `<div style="padding:12px 14px;border-top:1px solid #213029;border-left:3px solid ${c};background:${c}0d;margin-top:8px">
    <div style="font-weight:700;color:${c}">${esc(title)}</div>${body ? `<div style="color:#AEC0B8;font-size:12.5px;margin-top:4px;font-family:monospace">${body}</div>` : ""}</div>`;
}
