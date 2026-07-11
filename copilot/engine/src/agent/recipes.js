// AGENT MODE — task library. Six shipped recipes: named, tested templates that map
// a plain-English assignment to a goal + the domains it needs + where it MUST park.
// The loop still gates every action; recipes just make common jobs one-click and
// declare their expected approval points up front.
export const RECIPES = [
  {
    id: "chase_invoices",
    label: "Chase overdue invoices",
    match: /chase.*(invoice|overdue|aging)|overdue (invoice|payment)/i,
    goal: "Pull the aging report from the books, draft a reminder per overdue account, and PARK every send for approval.",
    parksAt: ["send_email"], // all reminders held; nothing sent without a tap
  },
  {
    id: "fill_form",
    label: "Fill an application / form",
    match: /fill.*(form|application)|apply at/i,
    goal: "Fill the form at the given URL from the business profile, screenshot the filled state, and PARK before submit.",
    parksAt: ["submit"],
  },
  {
    id: "pull_orders",
    label: "Pull a customer's recent orders",
    match: /pull.*(orders|order history)|last orders/i,
    goal: "Read the customer's recent orders from the platform and write them into notes. Read-only — no parking needed.",
    parksAt: [],
  },
  {
    id: "research",
    label: "Research across sites",
    match: /research|compare|find out|look up/i,
    goal: "Search the approved sites, extract the answer, and return it (not tabs). Read-only.",
    parksAt: [],
  },
  {
    id: "download_reports",
    label: "Download & file weekly reports",
    match: /download.*(report|statement)|pull.*reports/i,
    goal: "Download the requested reports and file them into the client's folder. Downloads are Tier 1 when the client asked.",
    parksAt: [],
  },
  {
    id: "update_listing",
    label: "Update menu / listing copy",
    match: /update.*(menu|listing|copy|description)|edit.*listing/i,
    goal: "Stage the edited copy on the platform, screenshot it, and PARK before publish.",
    parksAt: ["publish"],
  },
];

export function matchRecipe(assignment = "") {
  return RECIPES.find((r) => r.match.test(String(assignment))) || null;
}
