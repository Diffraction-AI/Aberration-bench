# Runnable benchmark implementation plan

7 September 2026. Build the two-track benchmark using established evaluation
practices, native subscriptions, and a standalone OpenRouter path.

| Work | Acceptance evidence | State |
| --- | --- | --- |
| Research/protocol | First-party sources, prepared and setup-inclusive tracks | Implemented |
| Versioned execution | Locked dependencies, Harbor 0.22.0, pinned browser image, explicit budgets | Implemented |
| Diagnostic apps | Three regressions plus three controls; six browser/viewport targets | Browser-verified |
| Participant bundles | Public allowlist, evaluator-free image, no-egress container | Oracle container-tested |
| Subscription adapters | Native Codex/Claude/Cursor auth, MCP, normalized usage/evidence | Implemented; live validation depends on account |
| OpenRouter | Exact model validation, vision/tools, receipts, time/cost boundaries | Implemented and mock-provider tested |
| Diffraction bridge | Immutable task/track contract, normalized results and failure handling | Contract tested; production connection pending |
| Collection/reporting | Frozen matrices, resume checks, artifact hashes, grading packets, paired intervals | Implemented and tested |
| Representative release | Historical candidates, admission and dispute rules | Independent case admission pending |

`npm run check` needs no credentials or inference. `npm run test:browser` exercises
all six diagnostic oracles and a two-case collection/resume workflow. Harbor oracle
execution validates the separate container path. CLI smoke tests are engineering
diagnostics, not independently graded comparative results.

## Before a credible head-to-head pilot

1. Connect the actual Diffraction pipeline to the prepared-pair contract, preserving
   receipts, cancellation and immutable pipeline/model identity.
2. Independently reproduce representative upstream regressions and matched controls.
   The initial target is 12 families / 24 tasks, beyond the original diagnostics.
3. Build pinned project environments, provider endpoint policies and equal browser,
   source/tool and resource access. Native local runs remain open development data.
4. Give competitors equal development/tuning access, then freeze submissions and
   execute the complete repeated matrix.
5. Obtain independent blinded judgments and complete cost accounting; resolve novel
   findings and disputes across every submission before finalizing results.
6. Publish every attempt, paired uncertainty and preregistered equivalence margins.
   Add separately versioned challenge sets without silently changing old scores.

SWE-bench motivates reproducible environments; WebArena/OSWorld motivate explicit
state/reset/evaluation; Harbor provides task/agent/verifier separation; τ-bench
motivates repeated-attempt reliability. These are design lessons, not evidence
that this dataset or product already wins. [Research](research.md) ·
[Execution and integration](execution.md).
