# Tests

Run both after any change to lib/diag-core.js or diag-airtable.js. Neither touches the live base or
the network: Airtable is stubbed in memory and the Clerk token is signed with a throwaway key so the
proxy's real JWT verification runs.

    node tests/diag-core-test.js    # grid totals derive to 35/27/10/62, scoring, NA rules, thresholds, muting
    node tests/diag-proxy-test.js   # all seven actions for every role, allowlists, stamping, benchmark rule, redaction
    npm install jsdom && node tests/check-e2e.js   # the real check.html end to end: consent, headlines, nine elements, report, profile, share link, resume
