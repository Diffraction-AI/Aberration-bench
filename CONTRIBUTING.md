# Contributing

Contributions from competing harness maintainers are welcome. Propose independently
reproducible UI regressions, clean controls, adapter integrations, rubric corrections
or reporting improvements. See [case admission](docs/cases.md).

Disclose your relationship to a participant, case provenance and any prior tuning on
the case. Include licenses and attribution. Never contribute customer code, account
data or screenshots without permission. Keep secrets outside commits.

Run `npm ci` and `npm run check`. Include a regression test for scoring changes that
could alter a ranking. Describe old and new numerical behavior with a small fixture.
For browser/runtime changes, install the pinned Playwright browsers and run
`npm run test:browser`. Run `npm run format:check` and
`python3 tools/test-harbor-verifier.py` as well. None invokes a paid provider.

Case disputes must include reproduction evidence. Resolve valid novel findings
before final scoring; do not penalize a system solely because our original oracle
missed a real regression. Version any correction and regrade every affected frozen
submission. Preserve original records and explanations.

A public release needs independent adjudication and a frozen protocol. Do not tune
cases, budgets, judges or prompts based on a preferred participant's release score.
Keep previous release scores available when adding new challenge sets. Competitors
may submit stronger, documented prompts and browser integrations on the same
published development allowance.
