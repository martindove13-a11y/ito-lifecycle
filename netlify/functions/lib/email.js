// Shared email helper for It's the Outcome.
// Sends lightly-branded HTML email via Resend from itstheoutcome.com.
//
// This file lives in netlify/functions/lib/ so Netlify does NOT expose it as
// its own HTTP endpoint. Other functions use it with:
//     const { sendEmail } = require('./lib/email');
//
// Usage:
//     const result = await sendEmail({
//       from: 'notifications' | 'hello',   // which sending address
//       to: 'someone@example.com',         // string or array
//       subject: 'Subject line',
//       heading: 'Big heading in the email',
//       bodyHtml: '<p>Body paragraphs as HTML.</p>',
//       ctaLabel: 'Open the dashboard',    // optional button label
//       ctaUrl: 'https://app.itstheoutcome.com/dashboard', // optional button link
//       text: 'Plain-text fallback'        // optional but recommended
//     });
//     // result is { ok: true, id } or { ok: false, error }

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API = 'https://api.resend.com/emails';

// From-addresses. notifications@ for internal/system mail, hello@ for
// participant-facing mail. Replies to either land in the monitored support alias.
const FROM = {
  notifications: "It's the Outcome <notifications@itstheoutcome.com>",
  hello:         "It's the Outcome <hello@itstheoutcome.com>"
};
const REPLY_TO = 'support@itstheoutcome.com';

// Brand palette, kept in sync with the app.
const BRAND = {
  orange:   '#E05C2A',
  ink:      '#111111',
  offwhite: '#F5F4F1',
  midgray:  '#6B6B6B'
};

// Escape text that may contain user-supplied values (names, emails) before
// placing it into HTML. bodyHtml is treated as raw; callers must escape any
// user data they interpolate into it themselves.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wrap content in the branded HTML shell. Email-safe: tables for layout,
// inline styles, web-safe fonts. Inter is not loaded (most clients ignore web
// fonts in email); Arial/Helvetica is the reliable fallback.
function renderHtml(opts) {
  const heading = opts.heading ? esc(opts.heading) : '';
  const bodyHtml = opts.bodyHtml || '';

  const headingBlock = heading
    ? `<h1 style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;line-height:1.3;color:${BRAND.ink};">${heading}</h1>`
    : '';

  const bodyBlock = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:${BRAND.ink};">${bodyHtml}</div>`;

  let ctaBlock = '';
  if (opts.ctaLabel && opts.ctaUrl) {
    ctaBlock = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px 0;">
        <tr>
          <td style="background:${BRAND.orange};border-radius:4px;">
            <a href="${esc(opts.ctaUrl)}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(opts.ctaLabel)} &rarr;</a>
          </td>
        </tr>
      </table>`;
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${BRAND.offwhite};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.offwhite};padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e6e2;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.ink};padding:16px 28px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.75);">It's the</span><span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;"> Outcome<span style="color:${BRAND.orange};">.</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 10px 28px;">
              ${headingBlock}
              ${bodyBlock}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 26px 28px;border-top:1px solid #f0efec;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.midgray};">It's the Outcome &middot; <a href="https://itstheoutcome.com" style="color:${BRAND.midgray};text-decoration:underline;">itstheoutcome.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Core send. Returns { ok: true, id } on success, { ok: false, error } on failure.
async function sendEmail(opts) {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not set' };
  if (!opts || !opts.to || !opts.subject) return { ok: false, error: 'Missing required field: to and subject' };

  const fromAddr = FROM[opts.from] || FROM.notifications;
  const html = renderHtml(opts);

  const payload = {
    from: fromAddr,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    reply_to: REPLY_TO,
    html: html
  };
  if (opts.text) payload.text = opts.text;

  try {
    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* non-JSON response */ }
    if (r.ok && data && data.id) return { ok: true, id: data.id };
    const msg = (data && (data.message || (data.error && data.error.message))) || ('HTTP ' + r.status);
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendEmail, esc, FROM, BRAND };
