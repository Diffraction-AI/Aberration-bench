# Aberration-bench

An MIT-licensed benchmark for autonomous UI review: finding visual and interaction
regressions, explaining their impact, and supplying reproducible browser evidence.

Compare complete systems—Codex, Claude Code, Cursor, OpenRouter-based agents, and
Diffraction—on quality, false alarms, coverage, time, and cost. A submission is the
harness, models, prompt, and toolchain together. Diffraction maintains this benchmark
and is also a prospective participant; publish negative results and disputes.

**Status: runnable diagnostic benchmark, not a certified leaderboard.** Six original
tasks exercise three regressions and their benign controls across Chromium, Firefox,
and WebKit at desktop/mobile sizes. Seven historical upstream candidates remain
unadmitted. Diagnostics test the machinery; they do not establish product superiority.

## Run it

Requires Node.js 24+. Diagnostics use no inference or provider credentials.

```sh
npm ci
npx playwright install chromium firefox webkit
# Linux: use npx playwright install --with-deps chromium firefox webkit
npm run check
node src/cli.ts doctor

# Reproduce base/candidate symptoms and create the diagnostic suite.
node src/cli.ts verify-diagnostics .generated/verification

# Execute the six-case diagnostic collector and generate a report.
node src/cli.ts batch config/experiments/diagnostic.json runs/diagnostic
```

Verification and single-run directories must be new, preserving previous evidence.
Batches resume only with identical frozen plans and intact collected artifacts.
Generated data, runs, credentials, and local virtual environments are ignored by Git.

## Use existing subscriptions

The native adapters use normal vendor login without requiring API keys. They strip
ambient API billing credentials and check native authentication before execution.
Install the CLIs and log in with `codex login`, `claude auth login`, or `agent login`.

```sh
node src/cli.ts run .generated/verification/suite.json config/submissions/codex.json runs/codex-a01 a01
node src/cli.ts run .generated/verification/suite.json config/submissions/claude.json runs/claude-a01 a01
node src/cli.ts run .generated/verification/suite.json config/submissions/cursor.json runs/cursor-a01 a01
```

These commands consume subscription allowances. Account eligibility and rate limits
still apply. Native defaults are explicitly recorded as unpinned; set `model` and
freeze the CLI version for comparative experiments. Claude uses its subscription
CLI rather than an API-only SDK. Subscription cost is **unknown**, never a fabricated
$0 API receipt.

`config/experiments/subscriptions.json` schedules three systems × six cases × three
attempts: **54 subscription runs**. Edit participants/repetitions before launching it.

## Use only OpenRouter

No Codex, Claude, Cursor, Harbor, or other inference account is required. This is a
direct vision/tool-calling agent using the same browser capability and report
contract. It is an **OpenRouter reference agent**, not Codex or Claude Code routed
through another provider.

1. Set an exact current model ID in `config/submissions/openrouter.json`.
2. Supply `OPENROUTER_API_KEY` through your shell's secret manager.
3. Run the single-case experiment:

```sh
node src/cli.ts batch config/experiments/openrouter.json runs/openrouter-pilot
```

The runner validates image/tool support against the live catalog, records generation
IDs and cost receipts, reserves an allowance before each request, and stops further
inference if spend cannot be reconciled. It never silently substitutes models or
retries inference. Delayed charges can exceed a reservation; overruns stay visible.
Local infrastructure cost remains unknown until independently measured.

## Fair comparisons

| Track | Starting point | Measures |
| --- | --- | --- |
| Prepared — primary | Ready, verified base/candidate apps and browser targets | Review quality, exploration, evidence and reporting |
| End-to-end — secondary | Source snapshots and equal resources | Setup plus review delivery |

The standard profile is **$1 and 600 seconds**, with optional $0.25/300-second and
$5/1800-second profiles. Timeouts, missing attempts, invalid reports, false alarms,
duplicates, and unknown charges remain visible. Independent reviewers substantiate
findings and coverage; paired confidence intervals keep repeats and controls within
their project/defect family. No local score certifies a public ranking.

The static diagnostic apps have no install/build phase. Their end-to-end clock
includes actual startup, not a pretend production deployment. Representative release
comparisons still need admitted project environments, pinned models, independent
judgments, and complete cost accounting.
[Protocol](docs/protocol.md) · [Case admission](docs/cases.md).

## Diffraction and Harbor

The Diffraction command bridge accepts immutable task identity, track, app pair,
budget, and artifact destination, then validates normalized pipeline results.
**The production pipeline connection is still required:** its existing PR-oriented
preview interface has not demonstrated the prepared-pair/cancellation contract.
See [integration instructions](docs/execution.md).

Harbor 0.22.0 task export is implemented and container-tested. The participant image
excludes oracles/evaluators; Harbor supplies solutions/tests separately. Its verifier
checks report structure and artifact integrity, not semantic review accuracy.

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-harbor.lock
node src/cli.ts export-harbor .generated/verification/suite.json .generated/harbor
.venv/bin/python tools/check-harbor.py .generated/harbor
.venv/bin/harbor run -p .generated/harbor/a01 -a oracle --env docker -n 1
```

Requires a running Docker engine, Compose, and Buildx. Generated runtime environments
deny network egress; the oracle needs no provider. Provider-backed Harbor agents need
a separately reviewed endpoint allowlist/auth arrangement. The local subscription
commands above work without that container setup.

## Grade and inspect

```sh
# Reviewer drafts and a separate evaluator-only identity mapping.
node src/cli.ts adjudicate runs/diagnostic/plan.json runs/diagnostic .generated/adjudication

# After collecting independent judgments:
node src/cli.ts report runs/diagnostic/plan.json runs/diagnostic/suite.json runs/diagnostic/trials.json runs/diagnostic/adjudications.json

node src/cli.ts schema review
node src/cli.ts schema adjudication
npm run test:browser
```

`score` emits machine-readable metrics. `verify-artifacts TRIAL.json ARTIFACT_ROOT`
checks referenced bytes. `demo` is synthetic accounting data. Reviewer drafts remain
unresolved and cannot be mistaken for completed judgments.

Design lessons from SWE-bench, WebArena, OSWorld, τ-bench, and Harbor are documented
with first-party sources in [research](docs/research.md). See the
[implementation plan](docs/implementation-plan.md) for remaining release gates.
The [validation record](docs/validation.md) distinguishes live checks from mocks and
lists preserved failures and account limitations.

## License

Original code and diagnostic apps are [MIT licensed](LICENSE). Upstream projects
retain their licenses. The historical catalog links to source without redistributing
it. See [CONTRIBUTING.md](CONTRIBUTING.md).
