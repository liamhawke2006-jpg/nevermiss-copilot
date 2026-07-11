// AGENT MODE — plain-English explanations. Turns a gated action into a sentence a
// non-technical business owner reads on the approval card / handoff, so they always
// know exactly what they're saying yes (or no) to.
import { classify, TIER } from "./classify.js";
import { hostOf } from "./guards.js";

export function explainAction(action = {}) {
  const g = classify(action);
  const t = String(action.type || "");
  let what;
  switch (t) {
    case "send_email": case "send": what = `send an email to ${action.to || "the recipient"}${action.subject ? ` — “${action.subject}”` : ""}`; break;
    case "submit": what = `submit this form`; break;
    case "publish": what = `publish this change`; break;
    case "purchase": case "buy": what = `place this purchase`; break;
    case "upload": what = `upload a file`; break;
    case "navigate": case "goto": what = `open ${hostOf(action.url)}`; break;
    case "fill": case "type": what = `fill the “${action.field || action.selector || "field"}” field`; break;
    case "download": what = `download the report`; break;
    default: what = `perform “${t}”`;
  }
  if (g.tier === TIER.BLOCK)
    return `I won't ${what} — that needs a credential, payment detail, or an irreversible action. I've handed this step to you.`;
  if (g.tier === TIER.HOLD)
    return `Ready to ${what}. Nothing happens until you approve — check the details above, then tap Approve.`;
  return `${cap(what)} (safe — I'll just do this).`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
