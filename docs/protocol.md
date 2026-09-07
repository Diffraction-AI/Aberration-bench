# Evaluation protocol — draft 0.1

This protocol is the proposed first experiment, not a report of executed runs.
Non-secret experimental choices live in `config/benchmark.json`. Freeze its digest,
the suite, prompt, adapters and model configurations before collecting release data.

## Unit of comparison

A submission is a complete review system: harness/version, all models and inference
settings, prompts, enabled tools, browser integration, skills, concurrency and
provider routing. Diffraction is a multi-model pipeline and must disclose every
model role and charge. Comparing it with a different model/harness combination is
a system comparison. A separate same-model ablation can isolate pipeline value.

Give Codex and Claude Code competent UI-review instructions and working browser
access. Let their maintainers improve adapters/prompts on development cases under
the same disclosed development allowance available to Diffraction. Freeze those
submissions before release. Do not compare a tuned product to a deliberately weak
one-line prompt without labeling that baseline separately.

Participants receive equivalent base/candidate app state, source snapshots/diff,
product requirements, accounts/data, requested targets and budgets. Native tools
may differ; record those differences. A browser integration must support navigation,
interaction, screenshots and the requested evidence types. Lack of a required
capability remains visible as incomplete coverage. A common-browser-tool ablation
may supplement the native-system comparison; never silently mix the two.

## Tracks and timing

**Prepared (primary):** the evaluator provisions, builds and independently health
checks both application revisions, restores seed data and starts the requested
browsers. Start the participant clock at task dispatch after readiness. Stop when
a schema-valid review and its artifacts are available, or at termination. Browser
exploration, model calls, baseline comparison, retries and evidence/report generation
are inside this clock. Provisioning time is separately recorded. Every participant
pays the same allocated application/browser runtime costs during its attempt.

**End-to-end (secondary):** start at acceptance of the same source snapshots, diff
and documented startup recipe. Include provisioning, install/build, startup,
exploration, retries, evidence generation and report availability. Use a fresh,
identically specified machine or equivalent resource allocation, a declared common
cache policy and pinned dependencies. Agent installation/model access is prepared
and disclosed equally; application setup is in scope. In addition, report native
hosted-product latency separately if its region/queue/resources cannot match the
controlled track. Do not rank unmatched hardware as a controlled head-to-head test.

The trial's `elapsedSeconds` is the applicable track's whole clock;
`setupSeconds` is a component, not an extra amount added during scoring. For prepared
runs it records the excluded provisioning phase. Capture phase timestamps and queue
time in the transcript. Collector clocks are authoritative, not model statements.
Human grading happens afterward and is not participant latency.

## Cases and repetitions

Begin with a development pilot; do not market it as a statistically established win.
Suggested first admission target: 12 independent defect families, each with a
regression task and a benign/no-change control (24 tasks). Include mobile layout,
keyboard/focus, interaction state, overlays/scrolling, navigation, motion/transients,
accessibility-related usability and browser-specific behavior. Do not select only
capabilities Diffraction already supports. Include multiple-defect changes as the
suite grows. Publish the matrix and all exclusions before running.

Use three fresh attempts per task/submission for a pilot and five for a release.
Keep model/session state isolated and reset app/browser state between attempts.
Shuffle the complete matrix with the declared seed. A supplied seed controls order;
it does not make provider inference deterministic. Keep project and defect families
in the same development/release split. The public historical candidates are already
exposed development cases.

All planned trials remain in reporting. Record setup failures, timeouts, invalid
outputs and missing trials explicitly. An evaluator-wide outage may justify rerunning
the affected block for every participant under a predefined rule; retain both
attempts. A participant failure cannot disappear by calling it infrastructure noise.

## Budgets and costs

Primary: standard, $1 and 600 seconds, with an immutable report/evidence checkpoint
at 300 seconds for five-minute analysis. Optional sweeps: economy ($0.25/300 seconds)
and extended ($5/1800 seconds). Compare like profiles and state the clock's track.
The runner preserves a partial report/evidence checkpoint for longer active runs.
The scorer summarizes final records; a missing checkpoint report never receives
retroactive five-minute credit for findings submitted later.

The runner must enforce time and reserve anticipated request costs before starting
provider work where possible. Dollar limits are not exactly enforceable from delayed
billing alone. Record configured caps, enforcement mechanism, in-flight overshoot
and final charges. An over-cap review earns no within-budget success even if its
findings are good. Cost-censored/timeout attempts remain in the trial denominator.

Maintain both model and infrastructure charge components, including retries,
cache/reasoning/tool charges and artifact processing/storage under a declared
retention allocation. Every monetary item has a basis: measured receipt,
price-card estimate, or unknown. Zero requires an explicit record; missing data
becomes null. Record subscription usage separately; it is not a measured zero-cost
API run. Retail subscription/product price, benchmark operator costs, and variable
execution costs are different accounts. Do not claim cost parity by comparing
Diffraction's internal cost with a competitor's marked-up retail price.

All systems' charges must use the same accounting window and inclusion policy.
Store raw provider/request IDs and pricing snapshots with the receipts. The scorer
can verify artifact hashes but cannot authenticate a provider receipt or detect
omitted requests; reconcile those independently before publication.

## Ground truth and adjudication

Independent oracles demonstrate the target failure in the candidate and its absence
in the base under the identical required flow/environment. Benign controls assert
the required behaviors remain functional, not that an entire application is perfect.
Two independent reviewers admit each case. Preserve base/head evidence with hashes.

Hide participant identity from adjudicators as far as practical; normalize branding
without changing finding content. Every reported claim receives a judgment:
true positive, false positive, duplicate, or unresolved. A true positive needs a
specific user-visible regression, reproducible steps, useful impact explanation,
verified captured evidence and verified baseline attribution. Text resemblance to
the oracle is insufficient. Different browsers showing the same defect count once.

Unexpected valid regressions trigger a case dispute. Resolve them and extend or
correct the oracle before scoring all submissions again. An absent reference label
does not prove a finding false. Unresolved findings block finalized results. A
machine judge may propose a match; two blinded human reviewers resolve release
labels and disagreements, with a third arbitrator when needed. Preserve judgments,
rationales and rubric version. Record inter-reviewer agreement before reconciliation.

For coverage, use independent traces to confirm required targets/flows were actually
exercised. The importer normalizes case-specific flow/browser/viewport combinations
into `requiredTargets` and adjudicated `coveredTargets`. A self-reported checklist
or a screenshot of the homepage cannot certify a full checkout flow.

## Metrics and publication

Publish a vector of outcomes rather than one opaque superiority score:

- Evidence-backed unique defect recall: TP / (TP + FN).
- Report precision: TP / (TP + FP + duplicate reports). Duplicates cannot improve a
  score and reduce the usefulness of the report. Report duplicates separately.
- F1 under that explicit duplicate penalty; per-category and severity breakdowns
  accompany it. Severity is evaluator-defined, never a participant's multiplier.
- Coverage, clean-review success, false reports per review, and failure rates.
- Quality-success rate: complete valid review, all required targets verified, all
  introduced defects found, no false/duplicate reports, no unresolved judgments.
- Success within the declared measured cost and elapsed-time budget.
- Total cost of **all** attempts per successful review, plus time/cost distributions.

The current scorer implements aggregate counts/rates, completed-run p50/p95, total
measured cost and cost per successful review. Its completed-run percentiles exclude
timeouts and must be displayed beside failure counts; they are not an uncensored
latency SLA. Empty denominators return null. Unknown cost blocks complete cost
reporting but does not erase quality measurements. No module certifies a release.

The reporter implements paired bootstrap confidence intervals clustered by
independent project/defect family, using identical sampled families across systems.
Do not treat each browser, viewport or repeated attempt as an independent sample.
Publish sample counts and intervals, all attempts, configurations, artifacts,
judgments, disputes and the exact scoring commit. Distinguish exploratory pilot
results from preregistered release results. A small numerical lead is not proof of
superiority. Define quality equivalence/non-inferiority margins before analyzing a
"same quality for less cost" claim; never equate a nonsignificant difference with
proven equivalence.

Keep fixed versioned suites for longitudinal comparison and add separately versioned
challenge sets as systems improve. Never change the ruler silently or select the
best budget/model/case subset after observing release results. Publish corrections
and regrade all affected systems. Disclose Diffraction's maintainer conflict.
