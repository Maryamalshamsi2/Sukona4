/**
 * Email body templates — plain HTML strings, one per `email_type`.
 *
 * We deliberately avoid React Email / MJML for v1: four templates
 * don't justify the dependency weight, and inlined-CSS HTML works
 * everywhere we need it to (Gmail, Outlook, iOS Mail, Apple Mail).
 *
 * Each renderer returns `{ subject, html, text }` so callers don't
 * have to know which strings go where — dispatch.ts passes the whole
 * object straight to sendEmail().
 *
 * Style: light, friendly, minimal chrome — mirrors the in-app aesthetic
 * (rounded buttons, neutral-900 primary, plenty of white space).
 */

export interface TemplateOutput {
  subject: string;
  html: string;
  text: string;
}

export interface WelcomeVars {
  ownerName: string;
  salonName: string;
  appUrl: string; // e.g. https://sukona.com
}

export interface TrialReminderVars {
  ownerName: string;
  salonName: string;
  daysLeft: number;
  trialEndsAt: Date;
  appUrl: string;
}

export interface TrialEndedVars {
  ownerName: string;
  salonName: string;
  appUrl: string;
}

// ---------- Shared chrome ----------

function shell(args: {
  preheader: string;
  body: string;
}): string {
  // `preheader` is the snippet shown next to the subject in Gmail/iOS
  // Mail previews. We hide it from the rendered body with the
  // standard 0-height/0-opacity trick.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sukona</title>
</head>
<body style="margin:0; padding:0; background-color:#FAFAFA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:#0A0A0A;">
  <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">${args.preheader}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAFAFA;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px; background-color:#FFFFFF; border:1px solid #EAEAEA; border-radius:16px;">
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              <div style="font-size:20px; font-weight:700; letter-spacing:-0.01em; color:#0A0A0A;">Sukona</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px; font-size:15px; line-height:1.55; color:#0A0A0A;">
              ${args.body}
            </td>
          </tr>
        </table>
        <div style="margin-top:16px; font-size:12px; color:#999999; line-height:1.5;">
          Sukona — for home-service beauty &amp; wellness businesses.<br />
          You are receiving this because you signed up at sukona.com.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:10px; background-color:#0A0A0A;">
        <a href="${href}" style="display:inline-block; padding:12px 22px; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ---------- Welcome ----------

export function renderWelcome(v: WelcomeVars): TemplateOutput {
  const subject = `Welcome to Sukona, ${v.ownerName.split(" ")[0]} 👋`;
  const loginUrl = `${v.appUrl}/login`;

  const html = shell({
    preheader: `Your 7-day free trial of Sukona has started.`,
    body: `
      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(v.ownerName)},</p>
      <p style="margin:0 0 16px 0;">Welcome to Sukona — and congrats on setting up <strong>${escapeHtml(v.salonName)}</strong>. Your 7-day free trial has started, with full access to every plan.</p>
      <p style="margin:0 0 8px 0;">A few things to try in your first session:</p>
      <ul style="margin:0 0 16px 20px; padding:0;">
        <li style="margin-bottom:6px;">Add your services and pricing</li>
        <li style="margin-bottom:6px;">Invite your team</li>
        <li style="margin-bottom:6px;">Book your first appointment from the calendar</li>
      </ul>
      ${button(loginUrl, "Open Sukona")}
      <p style="margin:0 0 0 0; color:#666666;">If anything is unclear, just reply to this email — it goes straight to us.</p>
    `,
  });

  const text = `Hi ${v.ownerName},

Welcome to Sukona — and congrats on setting up ${v.salonName}. Your 7-day free trial has started, with full access to every plan.

A few things to try first:
- Add your services and pricing
- Invite your team
- Book your first appointment from the calendar

Open Sukona: ${loginUrl}

If anything is unclear, just reply to this email — it goes straight to us.`;

  return { subject, html, text };
}

// ---------- Trial reminders (3 days, 1 day) ----------

export function renderTrialReminder(v: TrialReminderVars): TemplateOutput {
  const subject =
    v.daysLeft === 1
      ? `Last day of your Sukona trial`
      : `${v.daysLeft} days left on your Sukona trial`;

  const billingUrl = `${v.appUrl}/settings/billing`;
  const endDateLabel = formatTrialEnd(v.trialEndsAt);

  const headline =
    v.daysLeft === 1
      ? `Your free trial ends tomorrow.`
      : `Your free trial ends in ${v.daysLeft} days.`;

  const html = shell({
    preheader: `Trial ends ${endDateLabel}. Pick a plan to keep your data and team access.`,
    body: `
      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(v.ownerName)},</p>
      <p style="margin:0 0 16px 0;"><strong>${headline}</strong> Your trial for ${escapeHtml(v.salonName)} expires on <strong>${endDateLabel}</strong>.</p>
      <p style="margin:0 0 16px 0;">Pick a plan now and your subscription only starts charging when the trial ends — no double-billing.</p>
      ${button(billingUrl, "Choose a plan")}
      <p style="margin:0 0 16px 0; color:#666666;">All Sukona plans include unlimited appointments, clients, and WhatsApp confirmations. The difference is just how many staff you can add:</p>
      <ul style="margin:0 0 16px 20px; padding:0; color:#666666;">
        <li style="margin-bottom:4px;"><strong>Solo</strong> — 1 staff (just you)</li>
        <li style="margin-bottom:4px;"><strong>Team</strong> — up to 5 staff</li>
        <li style="margin-bottom:4px;"><strong>Multi-Team</strong> — unlimited staff</li>
      </ul>
      <p style="margin:0; color:#666666;">If Sukona isn't the right fit, no action is needed — your account will pause when the trial ends, and your data is kept for 30 days in case you change your mind.</p>
    `,
  });

  const text = `Hi ${v.ownerName},

${headline} Your trial for ${v.salonName} expires on ${endDateLabel}.

Pick a plan now and your subscription only starts charging when the trial ends — no double-billing.

Choose a plan: ${billingUrl}

Plans:
- Solo — 1 staff (just you)
- Team — up to 5 staff
- Multi-Team — unlimited staff

If Sukona isn't the right fit, no action is needed — your account will pause when the trial ends, and your data is kept for 30 days in case you change your mind.`;

  return { subject, html, text };
}

// ---------- Trial ended ----------

export function renderTrialEnded(v: TrialEndedVars): TemplateOutput {
  const subject = `Your Sukona trial has ended`;
  const billingUrl = `${v.appUrl}/settings/billing`;

  const html = shell({
    preheader: `Your Sukona account is paused. Pick a plan to bring it back online.`,
    body: `
      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(v.ownerName)},</p>
      <p style="margin:0 0 16px 0;">Your 7-day free trial for <strong>${escapeHtml(v.salonName)}</strong> has ended, and your account is now paused. Staff can still sign in to see read-only history, but new bookings are disabled until you pick a plan.</p>
      ${button(billingUrl, "Reactivate with a plan")}
      <p style="margin:0 0 16px 0; color:#666666;">Your data — clients, appointments, services, team, history — is all kept safe and will reappear the moment you resubscribe.</p>
      <p style="margin:0; color:#666666;">Was something missing? Reply to this email and let us know — we read every response.</p>
    `,
  });

  const text = `Hi ${v.ownerName},

Your 7-day free trial for ${v.salonName} has ended, and your account is now paused. Staff can still sign in to see read-only history, but new bookings are disabled until you pick a plan.

Reactivate with a plan: ${billingUrl}

Your data — clients, appointments, services, team, history — is all kept safe and will reappear the moment you resubscribe.

Was something missing? Reply to this email and let us know — we read every response.`;

  return { subject, html, text };
}

// ---------- Helpers ----------

/** Format a trial-end date like "Tue, May 27" — clear, no year noise. */
function formatTrialEnd(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Minimal HTML escape — owner name + salon name come from user input. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
