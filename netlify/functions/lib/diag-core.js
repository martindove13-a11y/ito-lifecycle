/* It's The Outcome. Value diagnostic: shared core.
   DIAG_CORE_CHECK_P1_2026_10

   One source of truth for the instrument. The nine elements, the eight moments, the question
   sentences and ladders for both perspectives, the headline levels, the bands, the role-to-moment
   table, the expected-presence grid, the disagreement threshold, the NA reason-code rules and the
   scoring function. Both diag-airtable.js and diag-report.js require this file, and the proxy's
   `config` action serves the browser the parts it needs. Nothing in here is duplicated anywhere.

   CommonJS, no dependencies. Everything that could change after the dry run is a value here, not
   a literal in a page, and every stored record carries INSTRUMENT_VERSION so changed wording never
   corrupts older data. */

'use strict';

const INSTRUMENT_VERSION = '1.0';
const CONSENT_VERSION = '1.0';

// ── Roles ───────────────────────────────────────────────────────────────────
// The three signed-in roles this app recognizes. Anything else is refused, including `admin`,
// which other apps in the same Clerk instance use. A role claim travels with the user.
const ROLES = Object.freeze({ SUPER: 'super_admin', FACILITATOR: 'facilitator', REP: 'rep' });
const SIGNED_IN_ROLES = Object.freeze([ROLES.SUPER, ROLES.FACILITATOR, ROLES.REP]);

// ── Perspectives ────────────────────────────────────────────────────────────
const PERSPECTIVES = Object.freeze({ SUPPLIER: 'Supplier view', CUSTOMER: 'Customer view' });

// ── The eight moments ───────────────────────────────────────────────────────
// Numbered 1 to 8. `artifact` is the document a facilitated session walks at that moment. Those
// names are placeholders until the methodology rewrite names them; the numbering and labels are
// the agreed ones.
const MOMENTS = Object.freeze([
  { n: 1, key: 'discovery', label: 'Discovery',       artifact: 'Discovery notes' },
  { n: 2, key: 'proposal',  label: 'Proposal',        artifact: 'Proposal or business case' },
  { n: 3, key: 'contract',  label: 'Contract',        artifact: 'Contract' },
  { n: 4, key: 'handoff',   label: 'Hand-off',        artifact: 'Hand-off pack' },
  { n: 5, key: 'golive',    label: 'Go-live',         artifact: 'Go-live record' },
  { n: 6, key: 'dashboard', label: 'Dashboard',       artifact: 'Customer dashboard' },
  { n: 7, key: 'review',    label: 'Business review', artifact: 'Business review' },
  { n: 8, key: 'renewal',   label: 'Renewal',         artifact: 'Renewal proposal' }
]);

// ── The nine elements ───────────────────────────────────────────────────────
// `prompt` is the one-line prompt on screen. `supplier` and `customer` are the question sentences
// for each perspective. Every sentence starts "In this deal," and never "in your company."
const ELEMENTS = Object.freeze([
  { n: 1, key: 'objectives',       label: 'Objectives',         prompt: 'what is the customer looking to achieve',
    supplier: "In this deal, is the customer's business objective written down, with a named owner on their side?",
    customer: 'In this deal, is your business objective written down, with a named owner on your side?' },
  { n: 2, key: 'baselines',        label: 'Baselines',          prompt: 'current state, captured before you start',
    supplier: 'In this deal, is there a measured starting value for the result the customer wants, with its source and date?',
    customer: 'In this deal, is there a measured starting value for the result you want, with its source and date?' },
  { n: 3, key: 'targets',          label: 'Targets',            prompt: 'the numbers and the deadlines',
    supplier: 'In this deal, is there an agreed target, a number and a date, tied to that starting value?',
    customer: 'In this deal, is there an agreed target, a number and a date, tied to that starting value?' },
  { n: 4, key: 'evidence',         label: 'Evidence',           prompt: 'what data will prove it, who can audit it',
    supplier: 'In this deal, is it agreed what data will show the result, where it comes from and who can audit it?',
    customer: 'In this deal, is it agreed what data will show the result, where it comes from and who can audit it?' },
  { n: 5, key: 'attribution',      label: 'Attribution',        prompt: 'how much of the result is truly yours',
    supplier: 'In this deal, is there an agreed way to decide how much of the result is due to your solution?',
    customer: "In this deal, is there an agreed way to decide how much of the result is due to the supplier's solution?" },
  { n: 6, key: 'confidence',       label: 'Confidence levels',  prompt: 'exposure scales with joint confidence',
    supplier: 'In this deal, do you and the customer share a written view of how likely the target is to be hit?',
    customer: 'In this deal, do you and the supplier share a written view of how likely the target is to be hit?' },
  { n: 7, key: 'responsibilities', label: 'Responsibilities',   prompt: 'what each party must do, who pays to measure',
    supplier: 'In this deal, is it written down what each side must do, by name, and who pays for measuring the result?',
    customer: 'In this deal, is it written down what each side must do, by name, and who pays for measuring the result?' },
  { n: 8, key: 'dispute',          label: 'Dispute resolution', prompt: 'what happens when numbers are contested',
    supplier: 'In this deal, is there an agreed way to settle a disagreement about the numbers, separate from the usual contract clause?',
    customer: 'In this deal, is there an agreed way to settle a disagreement about the numbers, separate from the usual contract clause?' },
  { n: 9, key: 'rebaselining',     label: 'Re-baselining',      prompt: 'what happened that will reset the baseline',
    supplier: 'In this deal, is there an agreed list of events that would reset the starting value, and a way to reset it?',
    customer: 'In this deal, is there an agreed list of events that would reset the starting value, and a way to reset it?' }
]);

// ── The ladder ──────────────────────────────────────────────────────────────
// Stored as 0 to 4. Rung 1 on either side means "exists but not shared in writing"; the rest map
// one to one. "I don't know" is stored as the string "dk", never as a rung.
const LADDER = Object.freeze({
  supplier: Object.freeze([
    "We don't have one.",
    "It's in our internal notes or CRM. The customer has never seen it.",
    "It's in the proposal or business case.",
    "It's written into the contract.",
    "It's live through delivery, reviews and renewal."
  ]),
  customer: Object.freeze([
    'We were never shown one.',
    'It was discussed but never written down for us.',
    'It was in the proposal or business case we received.',
    'It is written into our contract.',
    'We see it live in dashboards and reviews.'
  ])
});
const DONT_KNOW = 'dk';
const SHOW_TICK_PROMPT = 'Could you put it on screen in the next two minutes?';
const SHOW_TICK_MIN_RUNG = 2;   // the tick appears only when the respondent claims to have the element

// Which moment each rung stands for in the digital check. The live rung covers Hand-off through
// Renewal. Rung 0 stands for no moment and is never muted.
const RUNG_MOMENTS = Object.freeze({ 1: [1], 2: [2], 3: [3], 4: [4, 5, 6, 7, 8] });

// ── Headline questions and levels ───────────────────────────────────────────
const HEADLINE_LEVELS = Object.freeze([
  { key: 'input',       label: 'Input',       definition: 'Access to the service or product. Usage is not an outcome.' },
  { key: 'technical',   label: 'Technical',   definition: 'Service performance, such as uptime or response time.' },
  { key: 'operational', label: 'Operational', definition: "A defined unit of the customer's work completed." },
  { key: 'financial',   label: 'Financial',   definition: "A result in the customer's P&L." }
]);
const HEADLINE_KEYS = Object.freeze(['sold', 'contracted', 'provable']);
const HEADLINE_QUESTIONS = Object.freeze({
  supplier: Object.freeze({ sold: 'What outcome did you sell?', contracted: 'What does the contract commit you to?', provable: 'What can you prove today?' }),
  customer: Object.freeze({ sold: 'What outcome were you sold?', contracted: 'What does the contract commit the supplier to?', provable: 'What can you see proven today?' })
});
const SALES_QUESTION = 'Can you show a prospect, with evidence, what customers like them achieved?';
const SALES_QUESTION_OPTIONS = Object.freeze(['Yes', 'No', "Don't know"]);
// The only gap names the report uses.
const GAPS = Object.freeze({
  promise:     'Sold above contracted',
  exposure:    'Contracted above provable',
  opportunity: 'Provable above contracted'
});

// ── Roles on each side, and the role-to-moment table ────────────────────────
// Supplier roles are confirmed. Customer roles are the agreed list; their likely moments are an
// open point in the spec, so every customer role is given all eight moments (nothing muted) until
// Martin confirms a narrower table. Muting rungs on a guess would mislead respondents.
const ROLE_MOMENTS = Object.freeze({
  supplier: Object.freeze({
    'Sales':                     [1, 2, 3],
    'Customer success':          [4, 5, 6, 7, 8],
    'Services or delivery':      [4, 5, 6, 7],
    'Commercial or deal desk':   [2, 3, 8],
    'Value engineering':         [1, 2, 7, 8],
    'Executive':                 [1, 2, 3, 4, 5, 6, 7, 8]
  }),
  customer: Object.freeze({
    'Executive sponsor':         [1, 2, 3, 4, 5, 6, 7, 8],
    'Business owner':            [1, 2, 3, 4, 5, 6, 7, 8],
    'Operations or end user':    [1, 2, 3, 4, 5, 6, 7, 8],
    'Procurement or commercial': [1, 2, 3, 4, 5, 6, 7, 8],
    'Finance':                   [1, 2, 3, 4, 5, 6, 7, 8]
  })
});
const SALES_ROLE = 'Sales';   // the only role that gets SALES_QUESTION

// ── The expected-presence grid ──────────────────────────────────────────────
// Rows are elements 1 to 9, columns are moments 1 to 8. C = created or confirmed at this moment,
// F = carried forward and still visible, dash = not expected here and not scored as a gap.
// Confirmed by Martin on October 1, 2026, with Evidence created at Proposal. The totals (created,
// carried, not expected, scored) are DERIVED from this table by gridTotals() and never stored, so
// a count can never drift from the cells again.
const GRID_ROWS = Object.freeze([
  'CCFCFFCC',   // 1 Objectives
  '-CFFCFCC',   // 2 Baselines
  '-CCFFFFC',   // 3 Targets
  '-CCFFCCC',   // 4 Evidence
  '-CCFFFCC',   // 5 Attribution
  '-CCFFFFC',   // 6 Confidence levels
  '-CCCFFCC',   // 7 Responsibilities
  '--CFFFFC',   // 8 Dispute resolution
  '--CFCFCC'    // 9 Re-baselining
]);
const EXPECTED = Object.freeze({ CREATED: 'created', CARRIED: 'carried', NONE: 'none' });
function expectedAt(element, moment) {
  const ch = (GRID_ROWS[element - 1] || '')[moment - 1];
  return ch === 'C' ? EXPECTED.CREATED : ch === 'F' ? EXPECTED.CARRIED : EXPECTED.NONE;
}
function gridTotals() {
  const t = { created: 0, carried: 0, notExpected: 0, scored: 0, cells: 0 };
  for (let e = 1; e <= 9; e++) for (let m = 1; m <= 8; m++) {
    const x = expectedAt(e, m); t.cells++;
    if (x === EXPECTED.CREATED) t.created++;
    else if (x === EXPECTED.CARRIED) t.carried++;
    else t.notExpected++;
  }
  t.scored = t.created + t.carried;
  return t;
}
// The furthest moment an element is expected at, and the rung that moment stands for. The report
// compares each answer with this, not with the top of the ladder, so a later grid that shortens an
// element's run changes the report without a code change.
function expectedExtent(element) {
  let last = 0;
  for (let m = 1; m <= 8; m++) if (expectedAt(element, m) !== EXPECTED.NONE) last = m;
  let rung = 0;
  Object.keys(RUNG_MOMENTS).forEach(r => { if (RUNG_MOMENTS[r].indexOf(last) >= 0) rung = Number(r); });
  return { moment: last, rung };
}
// A fresh grid for a session: every cell carries its expected value copied in, so the session keeps
// the pattern it was scored against even if the grid changes later.
function freshGrid() {
  const g = {};
  for (let e = 1; e <= 9; e++) for (let m = 1; m <= 8; m++) {
    g[e + ':' + m] = { expected: expectedAt(e, m), state: null, na: null,
      quals: { documented: false, visible: false, data: false, agreed: false, current: false },
      where: '', note: '', conf: null, score: null };
  }
  return g;
}

// ── Bands ───────────────────────────────────────────────────────────────────
// Shared by the digital and facilitated records so segments compare directly. Size, Value and
// Stage reuse the Sprint Diagnostics table; Signed and Renewal bands are new and derived from dates.
const BANDS = Object.freeze({
  commercialModel: ['Fixed fee', 'Time and materials', 'Subscription', 'Consumption', 'Outcome-aligned', 'Outcome-based'],
  signed:          ['Under 1 year', '1 to 2 years', '2 to 3 years', 'Over 3 years'],
  renewal:         ['Past due', 'Within 3 months', '3 to 6 months', '6 to 12 months', 'Over 12 months'],
  size:            ['SMB', 'Mid-market', 'Enterprise', 'Global'],
  value:           ['<$100k', '$100k-$1m', '$1m-$10m', '>$10m'],
  stage:           ['Pre-contract', 'In life', 'Renewed', 'Churned', 'Disputed'],
  valueFunction:   ['Yes', 'No', "Don't know"],
  renewalOutcome:  ['Not yet due', 'Renewed', 'Churned', 'Unknown'],
  mode:            ['Quick check', 'Discovery', 'Facilitated review'],
  source:          ['Website', 'Community', 'ELEVATE card', 'Rep send', 'Counterpart invite', 'Customer invite', 'Portfolio', 'Cohort'],
  viewType:        ['Single', 'Joined', 'Two-sided']
});
function signedBand(signedDate, now) {
  const d = new Date(signedDate); if (isNaN(d)) return null;
  const years = ((now || new Date()) - d) / (365.25 * 24 * 3600 * 1000);
  return years < 1 ? 'Under 1 year' : years < 2 ? '1 to 2 years' : years < 3 ? '2 to 3 years' : 'Over 3 years';
}
function renewalBand(renewalDate, now) {
  const d = new Date(renewalDate); if (isNaN(d)) return null;
  const months = (d - (now || new Date())) / (30.4375 * 24 * 3600 * 1000);
  return months < 0 ? 'Past due' : months <= 3 ? 'Within 3 months' : months <= 6 ? '3 to 6 months' : months <= 12 ? '6 to 12 months' : 'Over 12 months';
}

// ── Thresholds and config values the dry run is expected to change ──────────
const CONFIG = Object.freeze({
  disagreementRungs: 2,        // two roles differ by this many rungs or more
  benchmarkMinResponses: 10,   // a segment publishes at or above this
  plausibilityFloorSeconds: 60,// a response finished faster than this is flagged, not blocked. Set properly after the first real completions.
  inviteesPerDeal: 3,          // one hop only, and no more than this many per deal
  invitesExpireDays: 14,
  portfolioBenchmarkCap: 3,    // deals per portfolio counted in published segments
  showTickAfterReport: false   // config flag from the spec: move the tick after the report if it costs completions
});

// ── Disagreement, for the combined view ─────────────────────────────────────
// Flagged when two answers differ by the threshold or more, or when one says "we don't have one"
// and another says the element is in the proposal or beyond. Don't-knows never disagree.
function disagree(a, b) {
  if (a === DONT_KNOW || b === DONT_KNOW || typeof a !== 'number' || typeof b !== 'number') return false;
  if (Math.abs(a - b) >= CONFIG.disagreementRungs) return true;
  return (a === 0 && b >= 2) || (b === 0 && a >= 2);
}

// ── NA reason codes ─────────────────────────────────────────────────────────
// NA-INPUT only where the methodology allows it, listed by element and moment. NA-TECH only for
// Attribution. NA-NOT-REACHED only for moments the deal has not got to yet. A cell not expected at
// that moment is set from the grid and is not a choice, so it is never an NA code.
const NA = Object.freeze({ INPUT: 'NA-INPUT', TECH: 'NA-TECH', NOT_REACHED: 'NA-NOT-REACHED' });
const NA_INPUT_ALLOWED = Object.freeze({ 6: [2, 3], 8: [3], 9: [3] });
const NA_TECH_ALLOWED = Object.freeze({ 5: [1, 2, 3, 4, 5, 6, 7, 8] });
function naAllowed(code, element, moment, dealMomentReached) {
  if (expectedAt(element, moment) === EXPECTED.NONE) return false;
  if (code === NA.INPUT) return (NA_INPUT_ALLOWED[element] || []).indexOf(moment) >= 0;
  if (code === NA.TECH)  return (NA_TECH_ALLOWED[element] || []).indexOf(moment) >= 0;
  if (code === NA.NOT_REACHED) return typeof dealMomentReached === 'number' && moment > dealMomentReached;
  return false;
}

// ── Scoring ─────────────────────────────────────────────────────────────────
// Mechanical, and only ever run on the server. Absent 0, described 1, seen and weak 2, seen and
// strong 3. Strong is seen and passing at least four of the five qualifiers including Agreed; every
// other seen cell is weak (methodology fix 4, which closes the gap between the two old rules). NA
// carries no score. A cell not expected at that moment carries no score and is not a choice.
const STATES = Object.freeze(['absent', 'described', 'seen']);
const QUALS = Object.freeze(['documented', 'visible', 'data', 'agreed', 'current']);
function scoreCell(cell) {
  if (!cell || cell.expected === EXPECTED.NONE) return null;
  if (cell.na) return null;
  if (cell.state === 'absent') return 0;
  if (cell.state === 'described') return 1;
  if (cell.state === 'seen') {
    const q = cell.quals || {};
    const passed = QUALS.filter(k => q[k] === true).length;
    return (passed >= 4 && q.agreed === true) ? 3 : 2;
  }
  return null;
}
// Persistence is derived, not typed: first moment an element appears, last moment it is seen.
function persistence(grid, element) {
  let first = null, last = null;
  for (let m = 1; m <= 8; m++) {
    const c = grid[element + ':' + m]; if (!c || c.expected === EXPECTED.NONE) continue;
    if (c.state === 'seen' || c.state === 'described') { if (first === null) first = m; }
    if (c.state === 'seen') last = m;
  }
  return { first, last };
}

// ── Answer shape checks, used by the proxy ──────────────────────────────────
function validRung(v) { return v === DONT_KNOW || (Number.isInteger(v) && v >= 0 && v <= 4); }
function validLevel(v) { return v === DONT_KNOW || HEADLINE_LEVELS.some(l => l.key === v); }
function validElement(n) { return Number.isInteger(n) && n >= 1 && n <= 9; }
function validMoment(n) { return Number.isInteger(n) && n >= 1 && n <= 8; }
function perspectiveKey(perspective) { return perspective === PERSPECTIVES.CUSTOMER ? 'customer' : 'supplier'; }
function rolesFor(perspective) { return Object.keys(ROLE_MOMENTS[perspectiveKey(perspective)]); }
function mutedRungs(perspective, role) {
  const moments = ROLE_MOMENTS[perspectiveKey(perspective)][role] || [];
  return [1, 2, 3, 4].filter(r => RUNG_MOMENTS[r].every(m => moments.indexOf(m) < 0));
}

// ── What the browser gets from `config` ─────────────────────────────────────
// Content only. The scoring function, NA rules and grid cell shape stay on the server.
function publicConfig() {
  return {
    instrumentVersion: INSTRUMENT_VERSION, consentVersion: CONSENT_VERSION,
    perspectives: PERSPECTIVES, moments: MOMENTS, elements: ELEMENTS, ladder: LADDER, dontKnow: DONT_KNOW,
    showTickPrompt: SHOW_TICK_PROMPT, showTickMinRung: SHOW_TICK_MIN_RUNG, rungMoments: RUNG_MOMENTS,
    headlineLevels: HEADLINE_LEVELS, headlineKeys: HEADLINE_KEYS, headlineQuestions: HEADLINE_QUESTIONS,
    salesQuestion: SALES_QUESTION, salesQuestionOptions: SALES_QUESTION_OPTIONS, salesRole: SALES_ROLE, gaps: GAPS,
    roleMoments: ROLE_MOMENTS, grid: GRID_ROWS, gridTotals: gridTotals(),
    expectedExtent: ELEMENTS.reduce((o, e) => { o[e.n] = expectedExtent(e.n); return o; }, {}),
    bands: BANDS, config: { disagreementRungs: CONFIG.disagreementRungs, showTickAfterReport: CONFIG.showTickAfterReport, inviteesPerDeal: CONFIG.inviteesPerDeal }
  };
}

module.exports = {
  INSTRUMENT_VERSION, CONSENT_VERSION, ROLES, SIGNED_IN_ROLES, PERSPECTIVES,
  MOMENTS, ELEMENTS, LADDER, DONT_KNOW, SHOW_TICK_PROMPT, SHOW_TICK_MIN_RUNG, RUNG_MOMENTS,
  HEADLINE_LEVELS, HEADLINE_KEYS, HEADLINE_QUESTIONS, SALES_QUESTION, SALES_QUESTION_OPTIONS, SALES_ROLE, GAPS,
  ROLE_MOMENTS, GRID_ROWS, EXPECTED, expectedAt, gridTotals, expectedExtent, freshGrid,
  BANDS, signedBand, renewalBand, CONFIG, disagree,
  NA, naAllowed, STATES, QUALS, scoreCell, persistence,
  validRung, validLevel, validElement, validMoment, perspectiveKey, rolesFor, mutedRungs, publicConfig
};
