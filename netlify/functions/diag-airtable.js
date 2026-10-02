/* It's The Outcome. Value diagnostic: Airtable proxy.
   DIAG_PROXY_CHECK_P1_2026_10

   The security boundary. The browser never touches Airtable. Copied from the Sprint and
   Development Model proxy pattern: role and account come only from the verified Clerk JWT, never
   the body; anonymous writes pass an allowlist; capability tokens are minted here with
   crypto.randomBytes; the share view never returns a session token; every owner write is
   shape-checked and rebuilt server side rather than patched through.

   Phase 1 actions: config, start, answer, list. Everything else returns 400. */

'use strict';
const crypto = require('crypto');
const CORE = require('./lib/diag-core');

// ── Environment (names only; values live in Netlify) ────────────────────────
const AIRTABLE_BASE  = process.env.DIAG_AIRTABLE_BASE  || process.env.AIRTABLE_BASE;
const AIRTABLE_TOKEN = process.env.DIAG_AIRTABLE_TOKEN || process.env.AIRTABLE_TOKEN;
const CLERK_ISSUER   = (process.env.CLERK_ISSUER || '').replace(/\/+$/, '');
const DAILY_DOMAIN_LIMIT = Number(process.env.DIAG_DAILY_DOMAIN_LIMIT) || 25;
const HASH_SALT = process.env.DIAG_HASH_SALT || AIRTABLE_BASE || 'diag';

const TABLES = Object.freeze({ DEALS: 'Deals', RESPONSES: 'Responses', INVITES: 'Invites', SESSIONS: 'Sessions', COMPANIES: 'Companies', RULINGS: 'Rulings', AGGREGATES: 'Aggregates' });

// ── Allowlists, from the field descriptions in diag-airtable-schema.md ──────
// Fields an anonymous respondent may set, by table. Everything else is stripped silently by design.
const DIAG_WRITE_FIELDS = Object.freeze({
  Deals:     new Set(['Commercial model', 'Renewal date', 'Signed band', 'Stage', 'Customer industry', 'Service lines', 'Value function', 'Size band', 'Value band']),
  Responses: new Set(['Respondent role', 'Answers', 'Headlines', 'Sales question', 'Email', 'Seconds reading'])
});
// Server-stamped; never trusted from the client.
const STAMPED = Object.freeze({
  Deals:     ['Deal code', 'Mode', 'Perspective', 'Source', 'Renewal band', 'Email domain', 'Account', 'Rep key', 'Company code', 'Portfolio key', 'Instrument version', 'Consent version', 'Created at'],
  Responses: ['Response key', 'Deal code', 'Perspective', 'View type', 'Email domain', 'Session token', 'Results token', 'Invited by', 'Completed at', 'Seconds to complete', 'Plausibility flag', 'Counted in benchmark', 'Instrument version', 'Consent version', 'Created at']
});
// super_admin only, on any table.
const SUPER_ONLY = new Set(['Counted in benchmark', 'Plausibility flag', 'Performance', 'Renewal outcome', 'Second reader', 'Capture proposal', 'Findings pack', 'Findings built at', 'Company token', 'Metrics', 'Suppressed', 'Rolled into']);
// What each signed-in role may read back from a Deal or Response row. Email is super only.
// Session token is returned once, at start, and never through any read.
const READ_FIELDS = Object.freeze({
  Deals: {
    base: ['Deal code', 'Mode', 'Perspective', 'Source', 'Commercial model', 'Renewal date', 'Signed band', 'Renewal band', 'Size band', 'Value band', 'Stage', 'Customer industry', 'Service lines', 'Value function', 'Email domain', 'Account', 'Rep key', 'Company code', 'Renewal outcome', 'Instrument version', 'Created at'],
    superExtra: ['Portfolio key', 'Performance', 'Consent version']
  },
  Responses: {
    base: ['Response key', 'Deal code', 'Perspective', 'Respondent role', 'View type', 'Answers', 'Headlines', 'Sales question', 'Email domain', 'Completed at', 'Seconds to complete', 'Seconds reading', 'Counted in benchmark', 'Instrument version', 'Created at'],
    superExtra: ['Email', 'Invited by', 'Plausibility flag', 'Consent version']
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: JSON.stringify(body) };
}
const safe = s => String(s || '').replace(/["\\]/g, '');
function pick(src, keys) { const out = {}; keys.forEach(k => { if (src && src[k] !== undefined) out[k] = src[k]; }); return out; }
const nowIso = () => new Date().toISOString();
const mint = (prefix, bytes) => prefix + crypto.randomBytes(bytes).toString('base64url');
const hash = s => crypto.createHash('sha256').update(HASH_SALT + '|' + String(s || '')).digest('base64url').slice(0, 22);
const J = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
function dealCode() {
  // Short, unguessable, never a customer name. 7 chars from an unambiguous alphabet.
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.randomBytes(7); let s = '';
  for (let i = 0; i < 7; i++) s += alpha[b[i] % alpha.length];
  return 'D-' + s;
}

// ── Airtable ────────────────────────────────────────────────────────────────
const atUrl  = (table, suffix) => 'https://api.airtable.com/v0/' + AIRTABLE_BASE + '/' + encodeURIComponent(table) + (suffix || '');
const atAuth = () => ({ 'Authorization': 'Bearer ' + AIRTABLE_TOKEN, 'Content-Type': 'application/json' });
async function atListAll(table, formula) {
  let records = [], offset = null;
  do {
    let url = atUrl(table, '?pageSize=100');
    if (formula) url += '&filterByFormula=' + encodeURIComponent(formula);
    if (offset)  url += '&offset=' + encodeURIComponent(offset);
    const r = await fetch(url, { headers: atAuth() }); const d = await r.json();
    if (!r.ok) return { status: r.status, data: d };
    if (d.records) records = records.concat(d.records);
    offset = d.offset || null;
  } while (offset);
  return { status: 200, data: { records } };
}
async function atCreate(table, fields) { const r = await fetch(atUrl(table), { method: 'POST', headers: atAuth(), body: JSON.stringify({ fields }) }); return { status: r.status, data: await r.json() }; }
async function atUpdate(table, id, fields) { const r = await fetch(atUrl(table, '/' + encodeURIComponent(id)), { method: 'PATCH', headers: atAuth(), body: JSON.stringify({ fields }) }); return { status: r.status, data: await r.json() }; }
function atErr(r) { const e = r && r.data && r.data.error; return (e && (e.message || e.type)) || ('Airtable ' + (r && r.status)); }

// ── Clerk verification (networkless JWKS, RS256), verbatim from the pattern ─
let _jwks = null, _jwksAt = 0;
async function getJwks() {
  if (_jwks && (Date.now() - _jwksAt) < 3600000) return _jwks;
  const r = await fetch(CLERK_ISSUER + '/.well-known/jwks.json');
  if (!r.ok) throw new Error('JWKS fetch failed: ' + r.status);
  const d = await r.json(); _jwks = d.keys || []; _jwksAt = Date.now(); return _jwks;
}
function b64url(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
async function verifyClerkSession(tok) {
  if (!CLERK_ISSUER || !tok || tok.split('.').length !== 3) return null;
  const [h, p, sig] = tok.split('.');
  let header, payload;
  try { header = JSON.parse(b64url(h).toString('utf8')); payload = JSON.parse(b64url(p).toString('utf8')); } catch (e) { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  const jwk = (await getJwks()).find(k => k.kid === header.kid);
  if (!jwk) return null;
  let pub; try { pub = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch (e) { return null; }
  if (!crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), pub, b64url(sig))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp + 5) return null;
  if (payload.nbf && now < payload.nbf - 5) return null;
  if (payload.iss && payload.iss.replace(/\/+$/, '') !== CLERK_ISSUER) return null;
  return payload;
}

// ── Handler ─────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed' });
  if (!AIRTABLE_BASE || !AIRTABLE_TOKEN) return reply(500, { error: 'Server not configured' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad JSON' }); }
  const action = String(body.action || '');

  // Who is calling. Role and account only from the verified token.
  const authz  = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const bearer = authz.indexOf('Bearer ') === 0 ? authz.slice(7) : '';
  let session = null;
  if (bearer) { try { session = await verifyClerkSession(bearer); } catch (e) { session = null; } }
  const role    = (session && session.role) || '';
  const account = (session && session.account) || '';
  const subject = (session && session.sub) || '';
  const email   = (session && (session.email || session.primary_email)) || '';
  // Only the three roles this app knows. An `admin` from another app is not signed in here.
  const signedIn = CORE.SIGNED_IN_ROLES.indexOf(role) >= 0;
  const isSuper = role === CORE.ROLES.SUPER, isFacilitator = role === CORE.ROLES.FACILITATOR, isRep = role === CORE.ROLES.REP;
  // Rep key: the stable Clerk user id, never the email, so a rep's deals survive an address change.
  const repKey = isRep ? (subject || hash(email)) : '';

  try {
    // ── config: no credential. Content only; no scoring logic. ──────────────
    if (action === 'config') return reply(200, CORE.publicConfig());

    // ── start: no credential. After consent, create the Deal and the Response. ──
    if (action === 'start') {
      // Honeypot: a hidden field real browsers leave blank.
      if (body.website) return reply(400, { error: 'Bad request' });
      if (body.consent !== true) return reply(400, { error: 'consent_required' });
      if (String(body.consentVersion || '') !== CORE.CONSENT_VERSION) return reply(400, { error: 'consent_version', expected: CORE.CONSENT_VERSION });

      const perspective = body.perspective === CORE.PERSPECTIVES.CUSTOMER ? CORE.PERSPECTIVES.CUSTOMER : CORE.PERSPECTIVES.SUPPLIER;
      const roleName = String(body.respondentRole || '');
      if (CORE.rolesFor(perspective).indexOf(roleName) < 0) return reply(400, { error: 'role_required', options: CORE.rolesFor(perspective) });

      const commercialModel = String(body.commercialModel || '');
      if (CORE.BANDS.commercialModel.indexOf(commercialModel) < 0) return reply(400, { error: 'commercial_model_required', options: CORE.BANDS.commercialModel });
      // Month and year of renewal, two taps. Stored as the first of that month. The band is derived.
      const ry = Number(body.renewalYear), rm = Number(body.renewalMonth);
      if (!(ry >= 2000 && ry <= 2100 && rm >= 1 && rm <= 12)) return reply(400, { error: 'renewal_date_required' });
      const renewalDate = ry + '-' + String(rm).padStart(2, '0') + '-01';
      // Time since signature is asked in bands in the digital check (no signed date is collected).
      const signed = String(body.signedBand || '');
      if (CORE.BANDS.signed.indexOf(signed) < 0) return reply(400, { error: 'signed_band_required', options: CORE.BANDS.signed });

      // Mode and source are server-decided. Phase 1 knows the public Quick check only; Discovery
      // sends and invites arrive with their own tokens in phase 4 and set these differently.
      const mode = 'Quick check';
      const source = CORE.BANDS.source.indexOf(body.source) >= 0 && ['Website', 'Community', 'ELEVATE card'].indexOf(body.source) >= 0 ? body.source : 'Website';

      // Email is optional and normally arrives after the report. If it is present now, the daily
      // domain cap applies here; otherwise it applies when the profile step supplies it.
      const emailIn = String(body.email || '').trim().toLowerCase();
      const domain = emailIn.indexOf('@') > 0 ? emailIn.split('@').pop() : '';
      if (domain) {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const today = await atListAll(TABLES.RESPONSES, 'AND({Email domain}="' + safe(domain) + '",IS_AFTER({Created at},"' + since + '"))');
        if (today.status === 200 && (today.data.records || []).length >= DAILY_DOMAIN_LIMIT) return reply(429, { error: 'daily_limit' });
      }

      const code = dealCode(), ts = nowIso();
      const deal = {
        'Deal code': code, 'Mode': mode, 'Perspective': perspective, 'Source': source,
        'Commercial model': commercialModel, 'Renewal date': renewalDate, 'Signed band': signed,
        'Renewal band': CORE.renewalBand(renewalDate), 'Stage': 'In life',
        'Account': account || '', 'Instrument version': CORE.INSTRUMENT_VERSION, 'Consent version': CORE.CONSENT_VERSION, 'Created at': ts
      };
      if (domain) deal['Email domain'] = domain;
      if (repKey) deal['Rep key'] = repKey;
      const d1 = await atCreate(TABLES.DEALS, deal);
      if (d1.status >= 300) return reply(502, { error: 'Could not create the deal', detail: atErr(d1) });

      const sess = mint('sess_', 18), res = mint('res_', 24), rkey = mint('r_', 9);
      const resp = {
        'Response key': rkey, 'Deal code': code, 'Perspective': perspective, 'Respondent role': roleName, 'View type': 'Single',
        'Answers': '{}', 'Headlines': '{}', 'Session token': sess, 'Results token': res,
        'Instrument version': CORE.INSTRUMENT_VERSION, 'Consent version': CORE.CONSENT_VERSION, 'Created at': ts
      };
      if (emailIn) { resp['Email'] = emailIn; resp['Email domain'] = domain; }
      const d2 = await atCreate(TABLES.RESPONSES, resp);
      if (d2.status >= 300) return reply(502, { error: 'Could not create the response', detail: atErr(d2) });

      // The session token is returned exactly once, here.
      return reply(200, { dealCode: code, responseKey: rkey, sessionToken: sess, resultsToken: res,
        perspective, respondentRole: roleName, mutedRungs: CORE.mutedRungs(perspective, roleName),
        salesQuestion: (perspective === CORE.PERSPECTIVES.SUPPLIER && roleName === CORE.SALES_ROLE), instrumentVersion: CORE.INSTRUMENT_VERSION });
    }

    // ── answer: sess_ token. Save one answer, rebuilt server side. ───────────
    if (action === 'answer') {
      const tok = String(body.sessionToken || '');
      if (!/^sess_[A-Za-z0-9_-]{20,40}$/.test(tok)) return reply(401, { error: 'Session required' });
      const found = await atListAll(TABLES.RESPONSES, '{Session token}="' + safe(tok) + '"');
      const rec = found.status === 200 && (found.data.records || [])[0];
      if (!rec) return reply(403, { error: 'Forbidden' });
      const f = rec.fields || {};
      if (f['Completed at']) return reply(403, { error: 'locked' });

      const patch = {};
      if (body.element !== undefined) {
        const el = Number(body.element), rung = (body.rung === CORE.DONT_KNOW) ? CORE.DONT_KNOW : Number(body.rung);
        if (!CORE.validElement(el) || !CORE.validRung(rung)) return reply(400, { error: 'bad_answer' });
        const answers = J(f['Answers']) || {};
        // Only the keys the client is allowed to set survive. The tick only means anything on a claimed rung.
        answers[String(el)] = { rung, show_tick: (typeof rung === 'number' && rung >= CORE.SHOW_TICK_MIN_RUNG) ? body.showTick === true : false };
        patch['Answers'] = JSON.stringify(answers);
      } else if (body.headline !== undefined) {
        const key = String(body.headline), level = body.level === CORE.DONT_KNOW ? CORE.DONT_KNOW : String(body.level || '');
        if (CORE.HEADLINE_KEYS.indexOf(key) < 0 || !CORE.validLevel(level)) return reply(400, { error: 'bad_headline' });
        const heads = J(f['Headlines']) || {};
        heads[key] = level;
        patch['Headlines'] = JSON.stringify(heads);
      } else if (body.salesQuestion !== undefined) {
        const v = String(body.salesQuestion);
        if (CORE.SALES_QUESTION_OPTIONS.indexOf(v) < 0) return reply(400, { error: 'bad_sales_answer' });
        if (!(f['Perspective'] === CORE.PERSPECTIVES.SUPPLIER && f['Respondent role'] === CORE.SALES_ROLE)) return reply(400, { error: 'sales_question_not_asked' });
        patch['Sales question'] = v;
      } else return reply(400, { error: 'nothing_to_save' });

      const u = await atUpdate(TABLES.RESPONSES, rec.id, patch);
      if (u.status >= 300) return reply(502, { error: 'Could not save', detail: atErr(u) });
      return reply(200, { ok: true });
    }

    // ── list: Clerk JWT. Scoped by role and account; anonymous gets 401. ─────
    if (action === 'list') {
      if (!session) return reply(401, { error: 'Sign-in required' });
      if (!signedIn) return reply(403, { error: 'Forbidden' });
      const table = String(body.table || TABLES.DEALS);
      if ([TABLES.DEALS, TABLES.RESPONSES].indexOf(table) < 0) return reply(400, { error: 'Table not available in this action' });

      let formula = '';
      if (isSuper) formula = '';                                                     // everything
      else if (isFacilitator) formula = '{Account}="' + safe(account) + '"';         // own account's rows
      else if (isRep) formula = '{Rep key}="' + safe(repKey) + '"';                  // own sends only
      if (!isSuper && !formula.replace(/.*="/, '').replace(/"$/, '')) return reply(200, { records: [] });   // no scope, nothing

      // Responses carry no Account or Rep key of their own; they are joined through the Deal.
      if (table === TABLES.RESPONSES && !isSuper) {
        const deals = await atListAll(TABLES.DEALS, formula);
        const codes = (deals.data.records || []).map(r => (r.fields || {})['Deal code']).filter(Boolean);
        if (!codes.length) return reply(200, { records: [] });
        formula = 'OR(' + codes.slice(0, 50).map(c => '{Deal code}="' + safe(c) + '"').join(',') + ')';
      }
      const r = await atListAll(table, formula);
      if (r.status !== 200) return reply(r.status, { error: atErr(r) });
      const fields = READ_FIELDS[table].base.concat(isSuper ? READ_FIELDS[table].superExtra : []);
      return reply(200, { records: (r.data.records || []).map(rec => ({ id: rec.id, fields: pick(rec.fields || {}, fields) })) });
    }

    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    return reply(500, { error: 'Proxy error', detail: String((e && e.message) || e) });
  }
};
