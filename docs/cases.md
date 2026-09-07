# Case admission

`evaluator/candidates.json` records seven public, SHA-pinned historical leads. They
are not executable admitted tasks and must never enter a scored run automatically.
`evaluator/suite.json` is intentionally empty until admission is complete.

The executable original diagnostic suite is generated separately by
`verify-diagnostics`. It contains three regressions and three benign controls in
three families. Its status is `verified`, not `admitted`: automated cross-browser
oracles establish reproducibility but do not impersonate independent human review.
Only the `diagnostic` split permits these verified cases to run. Original snapshot
SHA-1 values are real Git blob hashes (`revisionKind: git-blob`), not upstream commit
IDs. Neither those toys nor exposed historical fixes constitute a release holdout.

## A task needs

1. A licensed, redistributable application and pinned runtime, dependency lockfile,
   source revisions, build recipe, data/seed state and browser image digest.
2. Neutral public instructions describing legitimate product context and requested
   browser/viewport/flow coverage, without naming the hidden failure.
3. Separate base/candidate artifacts and a reproducible oracle demonstrating the
   relevant failure and its absence in the control. Include negative assertions.
4. Verification on the actual requested browser and viewport. Check native recording
   for temporal/canvas failures rather than inferring fidelity from a replay renderer.
5. Two independent reviewers, recorded admission decision, known limitations,
   attribution/license files and a complete task-content digest.
6. An independently checked benign/no-change task from the same family.

A historical merged fix has the opposite direction from an introduced regression:
old code is buggy, new code fixes it. Pin the fixed state as the review baseline,
then reverse only the isolated fix to construct a candidate regression. Keep
unrelated content and configuration identical. State this construction in evaluator
metadata and preserve both original PR provenance and constructed snapshot hashes.
Never simply call every old commit a clean baseline.

Do not copy issue text, fix-explaining commit messages, reference reproduction steps,
labels, tests or solutions into the participant's task environment. The source diff
itself remains legitimate input; discovering its consequence is part of the task.
A curated two-snapshot repository should exclude answer-bearing history while
preserving the reviewed diff. Keep the original full source history outside the
participant sandbox for provenance.

## Isolation and contamination

The public benchmark repository contains evaluator material for reproducibility.
It must not be mounted as a whole inside the agent workspace. File naming is not an
access boundary. Create a minimal task bundle and mount its application sidecars,
source snapshots, neutral prompt and output schema only. Enforce egress restrictions
outside the participant so an instruction cannot be the only barrier to fetching
answers from GitHub. Allow necessary model endpoints through a controlled gateway.
The local scoring CLI does not provision or enforce this boundary.

All seven carried candidates were already visible to Diffraction development and
have public fixes. They are development cases. A sealed set requires independent
new contributions and delayed release of labels/tasks after frozen-submission runs.
Do not describe public cases as an uncontaminated holdout just because local files
are withheld. If no sealed set is available, publish an explicitly open-set pilot.

## Admission record

Export the current suite contract with `node src/cli.ts schema suite`. Its oracle
artifacts and reviewer identities are recorded assertions, not automatically proven
admission. Verify real files, reproduction and independence before setting
`admission.status` to `admitted`.

Task IDs shown to participants should be neutral; evaluator candidate IDs may retain
upstream names. Never use `buggy`, `clean`, expected defect counts or issue titles in
the review URL or task prompt. Fresh sessions prevent a reviewer from remembering a
paired task. Controls are judged on introduced regressions in the defined scope;
incidental pre-existing bugs need separate labeling.
