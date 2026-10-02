/* It's The Outcome. Value diagnostic: scheduled housekeeping.
   DIAG_NUDGE_CHECK_P1_2026_10

   Registered in netlify.toml with schedule = "@daily". Phase 1 stub: returns 200 and does nothing.
   Later phases give it three jobs: expire invitations and clear their emails, refresh Aggregates,
   and send renewal follow-ups, the last of which runs only when DIAG_FOLLOWUP_ENABLED is set. */
'use strict';
exports.handler = async function () {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, ran: new Date().toISOString(), jobs: [] }) };
};
