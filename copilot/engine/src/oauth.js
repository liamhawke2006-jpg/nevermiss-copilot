// Gmail OAuth (send-only). Real flow: /start redirects the tenant to Google's
// consent screen; /callback exchanges the code for a refresh token we store on
// the tenant; the comms.gmail doer trades that for a short-lived access token to
// send. Works once GOOGLE_CLIENT_ID/SECRET + a registered redirect are set.
// All network calls use fetch, so it's testable with a mocked fetch.
import { randomBytes } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const redirectUri = (g) => `${g.redirectBase}/api/oauth/gmail/callback`;

export function gmailConfigured(g) { return !!(g && g.clientId && g.clientSecret); }

export function gmailAuthUrl(tenantId, g) {
  if (!gmailConfigured(g)) throw new Error("Gmail OAuth not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  const state = `${tenantId}.${randomBytes(8).toString("hex")}`;
  const u = new URL(AUTH);
  u.searchParams.set("client_id", g.clientId);
  u.searchParams.set("redirect_uri", redirectUri(g));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return { url: u.toString(), state };
}

export const tenantFromState = (state) => String(state || "").split(".")[0];

export async function exchangeCode(code, g) {
  const r = await fetch(TOKEN, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirectUri(g), grant_type: "authorization_code" }),
  });
  if (!r.ok) throw new Error(`Gmail token exchange failed (${r.status})`);
  return r.json(); // { access_token, refresh_token, ... }
}

export async function accessFromRefresh(refresh, g) {
  const r = await fetch(TOKEN, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: g.clientId, client_secret: g.clientSecret, grant_type: "refresh_token" }),
  });
  if (!r.ok) throw new Error(`Gmail token refresh failed (${r.status})`);
  return (await r.json()).access_token;
}
