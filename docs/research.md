# Benchmark design research

Research date: 7 September 2026. Audience: benchmark maintainers and external
contributors. Question: what is the fairest way to compare coding harnesses with
Diffraction's UI review pipeline, particularly setup, quality, time and cost?

## Recommendation

Use prepared applications for the primary review-quality comparison, and a separate
end-to-end track for the product's delivery promise. Both matter. A broken dependency
installation should not be mistaken for poor visual reasoning; the work required
to produce an actual customer review should not disappear from product economics.

Use Harbor for isolated task execution, with Aberration-bench owning UI cases,
neutral inputs, evidence and adjudication. The implementation validates Harbor's
task/container/oracle boundary. A separate local collector supports the owner's
subsequent subscription-CLI and direct-OpenRouter requirement without exporting
subscription credentials into containers. It is explicitly an open development
mode, not the sealed release environment. The real Diffraction prepared-pair
connection remains an integration gate.

## What established benchmarks do

| Benchmark / source | Relevant established practice | Implication for Aberration-bench |
| --- | --- | --- |
| SWE-bench | Its evaluation harness uses containerized task environments and supports layers of cached images. This stabilizes evaluation infrastructure; it is not evidence that every third-party submission uses identical agent setup. | Pin dependencies, source and environments. Record cache state. Define our clock explicitly instead of attributing a timing rule to SWE-bench. |
| SWE-bench Multimodal | Evaluates visual software problems; its September 2026 v2 page reports removing flaky/ungradeable tasks and rebuilding Docker environments for dependency/browser drift. | It is a useful source of task-design lessons, but fixing a disclosed issue differs from independently discovering a regression. Do not feed the bug description to reviewers. |
| Terminal-Bench 2.0 / Harbor | Tasks define instructions, environments, verification and optional oracle solutions. Harbor separates agents from the evaluator and already integrates Codex CLI and Claude Code. | Reuse orchestration. Keep the target application's task bundle distinct from grader material. Add Diffraction through the external-agent boundary if the pilot validates it. |
| WebArena | Supplies self-hostable applications and evaluates functional task completion in a controlled web environment. | Reset application data and sessions for every attempt; give participants equivalent live apps. |
| OSWorld, original/Verified design | Defines an initial setup configuration and task-specific execution evaluation for real computer tasks. The source now points to OSWorld 2.0; this comparison concerns its documented original design rather than current leaderboard numbers. | Treat setup and outcome verification as explicit parts of the case specification. |
| τ-bench, original methodology | Reports repeated-trial consistency with pass^k. The original repository is deprecated in favor of its successor; the repeated-attempt lesson remains useful. | Retain all independent attempts. Do not publish the best of several runs as a single-attempt score. |

Sources: [SWE-bench Docker guide](https://www.swebench.com/SWE-bench/guides/docker_setup/),
[SWE-bench Multimodal](https://www.swebench.com/multimodal),
[Harbor task structure](https://www.harborframework.com/docs/tasks),
[Harbor agents](https://www.harborframework.com/docs/agents),
[WebArena implementation](https://github.com/web-arena-x/webarena),
[OSWorld original/Verified project](https://osworld-v1.xlang.ai/),
[τ-bench original implementation](https://github.com/sierra-research/tau-bench).

These benchmarks do not collectively establish a universal rule about whether app
build time belongs in the scored agent clock. Their stronger common lesson is to
control and document environments and independently verify outcomes. Our two-track
choice is an inference from those practices and this benchmark's intended use.

## Infrastructure is part of the experiment

Anthropic reports a six-percentage-point Terminal-Bench 2.0 difference between its
most- and least-resourced configurations in an internal experiment. That is a
specific result, not a correction factor we can apply to this benchmark. It is
strong evidence that CPU/memory settings and failures deserve explicit reporting.
Record hardware, concurrency, browser versions, region, cache policy, queue time,
application health and setup failures. Separate an evaluator outage from a
participant's inability to complete the task. Keep the original failed attempt
when a retry is permitted. [Infrastructure noise study, 5 February 2026](https://www.anthropic.com/engineering/infrastructure-noise).

## What this benchmark needs beyond existing coding benchmarks

A UI review is an open-ended set of claims. Passing a unit test or spotting a
keyword cannot prove those claims are correct. Count a finding only when its
symptom, affected state, evidence and relation to the proposed change are supported.
Check the actual rendered UI; source-only predictions receive no evidence-backed
credit. Allow broader discovery and independently resolve legitimate new defects.

Use executable oracles to establish controlled failures and clean controls, then
blind human adjudication for semantic finding matches and actionability. An LLM
can propose matches but should not be the sole uncalibrated judge of whether its
competitor is wrong. Anthropic's evaluation guidance distinguishes code, model and
human grading and stresses inspecting outcomes and trajectories across repeated
trials. [Demystifying evals for AI agents, 9 January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

Public historical PRs are valuable development data, but an agent may already have
seen the issue or fix. Remove answer-bearing metadata from its task input, restrict
network access, and still disclose possible training contamination. File separation
and opaque task IDs prevent easy runtime leakage; neither proves that a public
case was absent from training. Build future release sets from fresh independent
contributions, keep project/defect families together when splitting, freeze
submissions before unveiling cases, and publish cases after evaluation. If all
cases are public at run time, label the result as an open-set evaluation.

## Testing the cost and speed hypothesis

There is no evidence yet that Codex or Claude Code necessarily needs more than ten
minutes or more than one dollar for these tasks. Strong coding harnesses may solve
some cases quickly. The useful result would be one of:

- Greater evidence-backed recall with comparable false alarms under the same budget.
- Comparable quality at lower measured variable cost and/or shorter latency.
- Better coverage, reproducibility or end-to-end reliability at comparable quality.

Use a budget curve, not just a single cap chosen around Diffraction. The draft
profiles are $0.25/5 minutes, $1/10 minutes and $5/30 minutes. Run the standard profile
first, then optional sweeps after inspecting measurement completeness. These
profiles are recommendations, configurable before an experiment. The extended
profile can reveal that a competitor catches more bugs if given more resources.

Compare provider charges separately from price-card estimates, subscription access,
and a commercial product's retail price. Record model, cache, reasoning and tool
usage plus compute/storage/browser costs and retries. No known marginal charge is
not equivalent to a free service. Human onboarding and adjudication time belong in
separate operational accounts, not silently charged to one participant's inference.

## Scope, confidence and gaps

The sources above are first-party benchmark projects, implementation documentation
and a first-party infrastructure experiment. This research does not claim an
exhaustive survey of every benchmark or independently reproduce their published
scores. We stopped after the material design choices had primary support and a
second pass resolved the key gap: environment preparation does not imply a single
universal latency-accounting rule.

Unresolved before an actual comparison: case admission, browser/tool parity, the
Harbor-to-Diffraction adapter, provider cost receipts, budget enforcement and
independent reviewers. None of the seven carried-forward historical candidates is
an admitted Aberration-bench case. No superiority or savings result exists yet.
