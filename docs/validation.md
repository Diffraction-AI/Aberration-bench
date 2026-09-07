# Implementation validation — 7 September 2026

These are engineering checks on original diagnostic tasks, not a leaderboard or an
independently adjudicated product comparison. Raw local runs are ignored by Git.
Reproduce the checks using the README commands on your own machine.

| Check | Observed result |
| --- | --- |
| `npm run check` | TypeScript passes; 28 unit tests pass; empty representative suite correctly remains unadmitted |
| `npm run format:check` | Passes |
| `npm run test:browser` | All six diagnostic oracles reproduce across six browser/viewport targets; two-case collection and identical-plan resume pass |
| `python3 tools/test-harbor-verifier.py` | Two independent structural/integrity verifier tests pass |
| Harbor 0.22.0 parser | All six exported task configurations accepted |
| Harbor Docker oracle job | Six trials, zero exceptions; report validity and artifact integrity pass for all six |
| Local diagnostic batch | Six of six attempts collected; reference findings match three regressions and three clean controls; grading packets export successfully |
| Codex subscription smoke | One finding with six screenshots, covering the mobile symptom in all three browsers; 124.23 seconds |
| Cursor subscription smoke | One finding with six screenshots, covering the mobile symptom in all three browsers; 148.99 seconds |
| Claude subscription gate | No subscription login available; collector preserves an error record and does not fall back to API billing |
| OpenRouter | Mock-provider tests pass; no live generation without an operator-selected model/key |
| Diffraction | External command contract tested; no production pipeline run or head-to-head result claimed |

Local environment: macOS arm64, Node 24.15.0, Playwright 1.63.0, Codex CLI 0.153.4,
Claude Code 2.1.251, Cursor CLI 2026.08.25-3e8eec8. Harbor uses the pinned Linux
Playwright image under a dedicated Docker VM. Latencies above are individual local
smoke observations from an earlier collected toolchain snapshot, not controlled
comparative latency statistics or final release measurements. Native models were
left at explicitly unpinned account defaults. Subscription dollar costs and local
infrastructure cost are unknown.

Cursor disclosed that full keyboard auditing was not completed across every target;
its correct mobile finding does not certify complete review coverage. Both native
runs still need independent semantic adjudication before scoring. The diagnostic
reference's perfect expected outcomes are oracle validation, not AI performance.

Earlier failed/incomplete checks were preserved locally: the first Codex attempt
could not obtain browser-tool approval (39.23 seconds, empty findings and explicit
untested limitations); the scoped MCP approval configuration fixed the later attempt.
The first Harbor setup lacked Docker Buildx, which was installed before the successful
container runs. One integration rerun correctly rejected source changes made while
its submission was frozen; the unchanged final rerun passed. None of these attempts
is silently promoted into an independent benchmark score.

The output directories include `runs/diagnostic`, `runs/codex-a01-smoke-v2`,
`runs/cursor-a01-smoke`, `runs/claude-a01-auth-check`, and
`jobs/diagnostic-oracle-final`. Screenshots, traces, browser video, prompts, usage,
hashes, limitations, and failure records remain available there for local inspection.

Release gates are listed in the [implementation plan](implementation-plan.md).
