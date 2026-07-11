// AGENT MODE — domain categories. A task touching a banking/legal/health domain is
// higher-stakes: it drives extra-caution + anomaly alerts. Category is derived from
// the hostname only (no content) so it can't be spoofed by page text.
import { hostOf } from "./guards.js";

const RULES = [
  ["banking", [/\bbank\b/, /chase|wellsfargo|wells-fargo|citi|usbank|capitalone|barclays|hsbc|amex|americanexpress/, /paypal|stripe|venmo|wise\.com|revolut|square(up)?/, /quickbooks|xero|freshbooks|gusto/, /coinbase|binance|kraken|crypto/]],
  ["legal", [/\blaw\b|legal|attorney|counsel|court|docusign|clio|lawpay|legalzoom|rocketlawyer/]],
  ["health", [/health|clinic|medical|patient|pharmacy|epic\.com|athenahealth|mychart|cerner|kaiser|teladoc/]],
];

export const SENSITIVE_CATEGORIES = new Set(["banking", "legal", "health"]);

export function domainCategory(url) {
  const h = hostOf(url);
  for (const [cat, patterns] of RULES) if (patterns.some((re) => re.test(h))) return cat;
  return "general";
}

export const isSensitiveDomain = (url) => SENSITIVE_CATEGORIES.has(domainCategory(url));
