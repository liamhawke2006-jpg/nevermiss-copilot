// AGENT MODE — Plan Preview & Trust Map (flagship). Before a task runs, turn the
// plain-English assignment into a legible plan: the expected steps, and for EACH one
// whether it's auto / will-pause-for-approval / will-refuse. The client approves the
// PLAN up front — they see exactly where control stays with them. No browser, no
// execution — pure preview off the recipe templates + the same code gates.
import { matchRecipe } from "./recipes.js";
import { classify, TIER } from "./classify.js";
import { explainAction } from "./explain.js";

// Representative step templates per recipe (real action shapes → real gate tiers).
const STEPS = {
  chase_invoices: [
    { label: "Open the books and read the aging report", action: { type: "read" } },
    { label: "Draft a reminder email per overdue account", action: { type: "fill", selector: "compose" } },
    { label: "Send each reminder", action: { type: "send_email", to: "the customer", subject: "Payment reminder" } },
  ],
  fill_form: [
    { label: "Open the form and read the fields", action: { type: "read" } },
    { label: "Fill it from your business profile", action: { type: "fill", selector: "form" } },
    { label: "Submit the form", action: { type: "submit" } },
  ],
  pull_orders: [
    { label: "Open the platform and find the customer", action: { type: "navigate", url: "https://platform" } },
    { label: "Read their recent orders", action: { type: "extract" } },
    { label: "Write them into your notes", action: { type: "fill", selector: "notes" } },
  ],
  research: [
    { label: "Search the approved sites", action: { type: "search" } },
    { label: "Extract the answer", action: { type: "extract" } },
    { label: "Return the answer (not tabs)", action: { type: "summarize" } },
  ],
  download_reports: [
    { label: "Open the platform", action: { type: "navigate", url: "https://platform" } },
    { label: "Download the requested reports", action: { type: "download" } },
    { label: "File them in your folder", action: { type: "fill", selector: "path" } },
  ],
  update_listing: [
    { label: "Open the listing editor", action: { type: "navigate", url: "https://platform" } },
    { label: "Stage the edited copy", action: { type: "fill", selector: "editor" } },
    { label: "Publish the change", action: { type: "publish" } },
  ],
};

const GENERIC = [
  { label: "Read the page and figure out the next step", action: { type: "read" } },
  { label: "Do the safe parts (navigate, read, fill)", action: { type: "fill", selector: "field" } },
  { label: "Pause before anything leaves the building", action: { type: "submit" } },
];

const GATE_LABEL = { [TIER.AUTO]: "auto", [TIER.HOLD]: "pause for your approval", [TIER.BLOCK]: "refuse — you do it" };

export function previewPlan(assignment = "") {
  const recipe = matchRecipe(assignment);
  const raw = (recipe && STEPS[recipe.id]) || GENERIC;
  const steps = raw.map((s) => {
    const g = classify(s.action);
    return { step: s.label, tier: g.tier, gate: GATE_LABEL[g.tier], note: explainAction(s.action) };
  });
  return {
    assignment,
    recipe: recipe ? recipe.id : "general",
    summary: recipe ? recipe.goal : "General task — I'll plan step by step and pause before anything leaves the building.",
    steps,
    willPause: steps.filter((s) => s.tier === TIER.HOLD).length,
    willRefuse: steps.filter((s) => s.tier === TIER.BLOCK).length,
  };
}
