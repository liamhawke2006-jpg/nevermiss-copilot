// HTTP + comms tools. GET is safe; POST / email / Slack leave the building and
// are world-changing (held). OFFLINE captures instead of actually sending.
import { RISK } from "../risk.js";

export default [
  {
    id: "http.get", domain: "http", risk: RISK.READ,
    description: "HTTP GET a URL",
    run: async ({ url }, ctx) => {
      if (ctx.offline) return { url, simulated: true, status: 200, note: "offline: not actually fetched" };
      const r = await fetch(url);
      return { url, status: r.status, text: (await r.text()).slice(0, 4000) };
    },
  },
  {
    id: "http.post", domain: "http", risk: RISK.SEND,
    description: "HTTP POST to a URL",
    run: async ({ url, body }, ctx) => {
      if (ctx.offline) return { url, simulated: true, captured: body };
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      return { url, status: r.status };
    },
  },
  {
    id: "comms.email", domain: "comms", risk: RISK.SEND,
    description: "Send an email",
    run: async ({ to, subject, body }, ctx) => {
      if (ctx.offline) return { to, subject, simulated: true };
      const sg = ctx.config && ctx.config.sendgrid;
      if (!sg || !sg.key) throw new Error("comms.email not configured: set SENDGRID_API_KEY (+ MAIL_FROM).");
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { authorization: `Bearer ${sg.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: sg.from },
          subject: subject || "(no subject)",
          content: [{ type: "text/plain", value: body || "" }],
        }),
      });
      if (!r.ok) throw new Error(`SendGrid ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return { sent: true, to, provider: "sendgrid" };
    },
  },
  {
    id: "comms.gmail", domain: "comms", risk: RISK.SEND,
    description: "Send an email via the tenant's connected Gmail account",
    run: async ({ to, subject, body }, ctx) => {
      if (ctx.offline) return { to, subject, simulated: true, via: "gmail" };
      const g = ctx.config && ctx.config.gmail;
      if (!g || !g.refresh) throw new Error("Gmail not connected for this tenant (run the Connect Gmail flow).");
      const { accessFromRefresh } = await import("../oauth.js");
      const token = await accessFromRefresh(g.refresh, g);
      const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject || ""}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body || ""}`).toString("base64url");
      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }),
      });
      if (!r.ok) throw new Error(`Gmail send ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return { sent: true, to, provider: "gmail" };
    },
  },
  {
    id: "comms.slack", domain: "comms", risk: RISK.POST,
    description: "Post a Slack message",
    run: ({ channel, text }, ctx) => {
      if (ctx.offline) return { channel, simulated: true };
      throw new Error("comms.slack not wired (connect the Slack MCP / webhook).");
    },
  },
];
