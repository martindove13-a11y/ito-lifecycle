/* It's The Outcome. Value diagnostic: report computation.
   DIAG_REPORT_CHECK_P2_2026_10

   Computed on the server from stored answers, so the logic never ships to the browser and can
   change without touching saved data. Compares each answer with how far that element is EXPECTED
   to travel (from the grid in diag-core), not with how far the ladder goes. Don't-knows are shown
   on their own and never averaged in. No summary score, anywhere. */

'use strict';
const CORE = require('./diag-core');

const LEVEL_RANK = { input: 0, technical: 1, operational: 2, financial: 3 };
const COMPARATOR_NOTE = 'Compared with the expected pattern, version one: the hypothesis the validation program is testing. This is not a benchmark.';
const LIMITS_NOTE = 'A digital check does not assess whether evidence is grounded in data, current or of good quality. That needs a facilitator looking at the document.';

// Status for one element from one answer. `extent` is the expected rung from the grid.
function elementStatus(rung, extent, perspective) {
  const pk = CORE.perspectiveKey(perspective);
  if (rung === CORE.DONT_KNOW || rung === undefined || rung === null) return { key: 'dk', label: 'Not visible to you', counts: false };
  if (rung >= extent) return { key: 'reaches', label: 'Reaches where good practice expects', counts: true, reached: true };
  if (rung === 0) return { key: 'absent', label: 'Not in place', counts: true, reached: false };
  if (rung === 1) return { key: 'internal', label: pk === 'customer' ? 'Discussed, but never written down for you' : 'Exists, but the customer has never seen it', counts: true, reached: false };
  return { key: 'short', label: 'Stops at "' + CORE.LADDER[pk][rung] + '" Expected to reach "' + CORE.LADDER[pk][Math.min(rung + 1, 4)] + '"', counts: true, reached: false };
}

// The three headline levels and the only gap names the report uses.
function headlineGaps(heads) {
  const h = heads || {}, r = k => (h[k] && h[k] !== CORE.DONT_KNOW) ? LEVEL_RANK[h[k]] : null;
  const sold = r('sold'), con = r('contracted'), prov = r('provable');
  const gaps = [];
  if (sold !== null && con !== null && sold > con) gaps.push({ key: 'promise', label: 'Promise gap', text: CORE.GAPS.promise });
  if (con !== null && prov !== null && con > prov) gaps.push({ key: 'exposure', label: 'Exposure gap', text: CORE.GAPS.exposure });
  if (prov !== null && con !== null && prov > con) gaps.push({ key: 'opportunity', label: 'Opportunity gap', text: CORE.GAPS.opportunity });
  return { levels: { sold: h.sold || null, contracted: h.contracted || null, provable: h.provable || null }, gaps };
}

// One response -> the single (functional) view.
function singleView(response) {
  const answers = response.answers || {}, perspective = response.perspective || CORE.PERSPECTIVES.SUPPLIER;
  const elements = CORE.ELEMENTS.map(e => {
    const a = answers[String(e.n)] || {};
    const rung = (a.rung === CORE.DONT_KNOW) ? CORE.DONT_KNOW : (Number.isInteger(a.rung) ? a.rung : null);
    const extent = CORE.expectedExtent(e.n).rung;
    const status = elementStatus(rung, extent, perspective);
    return { n: e.n, label: e.label, prompt: e.prompt, rung, extent, showTick: a.show_tick === true, status };
  });
  const answered = elements.filter(x => x.rung !== null);
  const dk = elements.filter(x => x.rung === CORE.DONT_KNOW).length;
  const reached = elements.filter(x => x.status.reached === true).length;
  const scoredCount = elements.filter(x => x.status.counts).length;
  return {
    view: 'Single', perspective, role: response.role || '',
    headline: { reached, of: 9, dontKnow: dk, answered: answered.length, scored: scoredCount,
      line: reached + ' of 9 reach where good practice expects' + (dk ? ', ' + dk + ' not visible to you' : '') },
    elements, headlineLevels: headlineGaps(response.headlines),
    salesQuestion: response.salesQuestion || null,
    comparator: COMPARATOR_NOTE, limits: LIMITS_NOTE,
    ladder: CORE.LADDER[CORE.perspectiveKey(perspective)], instrumentVersion: response.instrumentVersion || CORE.INSTRUMENT_VERSION
  };
}

// Several responses on one deal -> the combined view. The combined answer per element is the
// furthest rung any respondent states, labelled with the role that gave it. A don't-know from one
// role is shown as covered by the role that could see it. Views are never averaged.
function combinedView(responses) {
  const perspective = responses[0].perspective || CORE.PERSPECTIVES.SUPPLIER;
  const elements = CORE.ELEMENTS.map(e => {
    const views = responses.map(r => { const a = (r.answers || {})[String(e.n)] || {}; return { role: r.role, rung: a.rung === CORE.DONT_KNOW ? CORE.DONT_KNOW : (Number.isInteger(a.rung) ? a.rung : null), showTick: a.show_tick === true }; })
      .filter(v => v.rung !== null);
    const numeric = views.filter(v => typeof v.rung === 'number');
    const best = numeric.slice().sort((a, b) => b.rung - a.rung)[0] || null;
    const extent = CORE.expectedExtent(e.n).rung;
    const disagreements = [];
    for (let i = 0; i < numeric.length; i++) for (let j = i + 1; j < numeric.length; j++) {
      if (CORE.disagree(numeric[i].rung, numeric[j].rung)) disagreements.push([numeric[i], numeric[j]]);
    }
    const covered = views.filter(v => v.rung === CORE.DONT_KNOW).map(v => v.role);
    return { n: e.n, label: e.label, prompt: e.prompt, rung: best ? best.rung : (views.length ? CORE.DONT_KNOW : null), extent,
      byRole: best ? best.role : null, showTick: best ? best.showTick : false, status: elementStatus(best ? best.rung : (views.length ? CORE.DONT_KNOW : null), extent, perspective),
      coveredFor: best ? covered : [], disagreements: disagreements.map(([a, b]) => ({ a: { role: a.role, rung: a.rung }, b: { role: b.role, rung: b.rung } })), views };
  });
  const dk = elements.filter(x => x.rung === CORE.DONT_KNOW).length, reached = elements.filter(x => x.status.reached === true).length;
  return {
    view: 'Joined', perspective, roles: responses.map(r => r.role),
    headline: { reached, of: 9, dontKnow: dk, line: reached + ' of 9 reach where good practice expects' + (dk ? ', ' + dk + ' not visible to anyone who answered' : '') },
    elements, headlineLevels: responses.map(r => ({ role: r.role, levels: headlineGaps(r.headlines) })),
    comparator: COMPARATOR_NOTE, limits: LIMITS_NOTE, ladder: CORE.LADDER[CORE.perspectiveKey(perspective)]
  };
}

// Counts the notification to Martin needs: elements short of expected, and don't-knows.
function summaryCounts(response) {
  const v = singleView(response);
  return { short: v.elements.filter(x => x.status.counts && !x.status.reached).length, dontKnow: v.headline.dontKnow, reached: v.headline.reached };
}

module.exports = { elementStatus, headlineGaps, singleView, combinedView, summaryCounts, COMPARATOR_NOTE, LIMITS_NOTE };
