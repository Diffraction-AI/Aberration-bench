# Execution and integration

## Local and container execution

The local collector runs subscription CLIs or a direct OpenRouter agent against the
same browser API. It owns app/browser lifecycle, authoritative timing, report
validation, screenshot provenance, trace/video capture, and normalized trial files.
A loopback MCP bridge requires an ephemeral scoped token; provider keys are not
sent to the browser or task apps. Non-secret choices live in versioned config.

This is a **common-browser-tool diagnostic comparison**. Native abilities still
differ: Claude has only the designated MCP tool; Codex/Cursor retain some native
capabilities. The local participant shares the operator's machine. Its working
directory and filtered browser are not a sealed filesystem/network sandbox. Use
original trusted diagnostics locally, not untrusted PR builds. These runs are open
development data, not a contamination-resistant release.

Harbor provides the container task/agent/verifier boundary. Export pins Harbor
0.22.0, a Playwright 1.63.0 image digest, 2 CPUs and 4 GB memory. Its image build
context explicitly copies only public task/runtime dependencies; oracle code, labels,
adjudicators and git history are absent. Harbor supplies solutions and tests through
separate channels. The generated no-egress oracle has passed real container execution.

Provider-backed Harbor agents need a documented endpoint allowlist and auth setup.
Do not enable unrestricted internet and call it a sealed release. Local subscription
CLIs are a development convenience, not proof that Harbor supports those subscription
arrangements unchanged. Harbor also requires working Docker Compose and Buildx.

Harbor rewards **report_valid** and **artifact_integrity** only. A separate
`adjudication-status.json` records pending semantic review. A reward of 1 does not
mean every regression was found. [Task model](https://www.harborframework.com/docs/tasks),
[agent integration](https://www.harborframework.com/docs/agents).

## Authentication and model identity

| Adapter | Interface | Accounting |
| --- | --- | --- |
| Codex | Native ChatGPT login; ephemeral JSON exec; scoped MCP browser | Subscription usage, no fabricated API receipt |
| Claude Code | Native subscription OAuth; print/stream JSON; strict MCP | Subscription usage; no bare/API-only mode |
| Cursor | Native agent CLI login; stream JSON; workspace MCP; sandbox | Subscription usage |
| OpenRouter | Explicit API key/model; direct vision/tool loop | Generation IDs and cost receipts |
| Diffraction | Configured executable with JSON request/result contract | Real pipeline receipts, version, models and cancellation |

Native CLI versions are collected before the plan is frozen. Changing code, config,
prompt, dependency lock, or CLI version invalidates batch resume. Native default
models are marked unpinned; select explicit model IDs before comparisons. Account
eligibility/rate limits still apply. Subscription auth checks prevent a silent
API-key fallback. The child environment omits ambient model billing credentials.

Codex CLI 0.153.4 completed a real browser diagnostic during implementation. Installed
Claude Code 2.1.251 lacked an authenticated subscription; no successful Claude review
is claimed. Cursor CLI 2026.08.25-3e8eec8 also completed a real diagnostic review;
see [validation](validation.md) for scope and limitations. `doctor` reports availability
without inference or login.

Official references: [Codex auth](https://learn.chatgpt.com/docs/auth),
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp),
[Claude auth](https://code.claude.com/docs/en/authentication),
[Cursor CLI](https://cursor.com/docs/cli/overview).
Invocation flags were also checked against installed CLI help. Codex auto-approval
is limited to this scoped browser MCP tool; it does not approve arbitrary shell work.

## Direct OpenRouter execution

The adapter requires a configured model with live catalog support for images/tools.
Screenshots are image content, browser actions are JSON Schema tools, and routing
requests `data_collection: "deny"` with required parameter support. This does not
recreate a commercial harness's orchestration.

Each inference retains generation ID and usage. A bounded metadata lookup sequence
reconciles `total_cost` into a hashed receipt. Unavailable costs halt further
inference. Metadata lookups can retry; inference requests never silently retry.
A configured per-request reservation gates new calls but is not a provider-side
hard dollar ceiling. Expensive contexts or delayed billing can exceed it; overruns
remain recorded and fail the measured-budget metric.

Mock-provider tests cover measured/unknown/excessive charges, unsupported models,
HTTP failure, and request admission. A live generation needs an operator-selected
model and credential; none is claimed by those tests.
[Tool calling](https://openrouter.ai/docs/guides/features/tool-calling),
[generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation).

## Connect Diffraction

The implemented `diffraction-command` adapter invokes a real pipeline bridge
outside this public repo. Example configuration, replacing placeholders:

```json
{
  "id": "diffraction",
  "adapter": "diffraction-command",
  "access": "external",
  "model": "exact-pipeline-model-configuration",
  "pipelineVersion": "immutable-pipeline-commit",
  "models": ["exact-model-id-for-each-role"],
  "executable": "/absolute/path/to/diffraction-benchmark-bridge",
  "arguments": [],
  "credentialEnv": "DIFFRACTION_BENCH_TOKEN"
}
```

The collector executes `bridge [arguments] REQUEST.json RESULT.json` without a
shell. Request fields: `schemaVersion`, `taskDigest`, `track`, `task`, `origins`,
`profile`, and `artifactDirectory`. App origins are loopback addresses requiring a
colocated worker; they are not reachable by a hosted pipeline automatically.

The bridge must copy genuine evidence/receipts into the artifact directory and write
an `ExternalResult` from `src/adapters/external.ts`: schema version 1, exact task
digest and track, immutable `pipelineVersion`, complete `models`, terminal
`status`, canonical `review`, `charges`, `cancellationConfirmed`, and
`limitations`. Findings/charges follow the published schemas. Measured costs require
hashed receipts; missing components become unknown. The collector checks identity
and artifact bytes, not the authenticity of provider billing.

Forward termination to the actual pipeline and preserve partial charges/evidence on
failure. Killing the bridge does not prove a remote review stopped. Check an
unconfirmed run before retrying.

The existing private preview interface takes a PR URL and performs its own setup;
it has not demonstrated a controlled base/candidate input or cancellation boundary.
That product connection remains required before a prepared-track comparison.
Do not substitute a single-revision preview, the deterministic oracle, or the local
Codex-based development harness and label it the production Diffraction pipeline.
This repo contains no copied private product code or fabricated Diffraction result.

## Collection and clocks

`run` creates a new attempt. `batch` freezes the complete shuffled matrix, executes
sequentially, and saves plan, suite, experiment, trials and report after each slot.
It refuses changed plans, corrupt artifacts and partially collected directories on
resume. Every attempt gets fresh app/browser contexts; missing trials remain in
the scheduled denominator.

Prepared timing starts after apps and all browser contexts pass initial page
readiness. End-to-end starts before app startup. Both include final evidence
packaging; provenance separately records initial report availability. Static
diagnostics have no install/build phase. A five-minute partial evidence checkpoint
is saved for longer active runs. No report at that checkpoint means no completed
five-minute review, rather than retroactive credit for a later report.

Attempt directories contain `trial.json`, `provenance.json`, a participant workspace,
and artifacts: exact prompt, tool trajectory, receipts where available, screenshots,
per-context Playwright traces and video. Trial-referenced artifact bytes are verified.
Raw traces/video are available for independent inspection. Inspect local logs before
publishing; credential redaction is not a general personal-data scrubber.

## Independent grading and reports

`adjudicate` produces randomly named reviewer packets and a separate evaluator
identity mapping. Explicit harness identity/usage is omitted from packets, but review
prose can still reveal a system. Reviewers also need independent reproduction and
trace access to certify flows/coverage. Complete real reviewer IDs and substantive
judgments, resolve aliases back to slot IDs, then supply schema-valid adjudications
to `score` or `report`. Drafts remain invalid/unresolved. Two reviewer names are
required for release judgments but are not authenticated identities.

Reports separate measured model subtotals from unknown infrastructure costs.
Subscription estimates remain provenance rather than measured dollars. Final quality
labels wait for complete adjudication. Paired two-system confidence intervals sample
whole project/defect families, keeping repeats/controls together. Fewer than two
families or incomplete judgments withhold intervals; two families is a computation
guard, not adequate statistical power. No report certifies a public release.

## Coverage evidence in grading packets

`adjudicate` exports the original, hash-verified execution transcript for every submitted trial, including reviews with no findings. Transcripts are stored under `evaluator/coverage/<alias>/` with a hash and artifact-kind index. The reviewer directory continues to contain the original finding content and cited evidence.

Raw traces can identify participants. Reviewers should complete blinded claim judgments first; the evaluator then supplies the corresponding coverage trace for checking actual browser actions/results against required targets. Narrative claims of complete coverage do not establish coverage. Missing or inconclusive trace evidence remains unresolved. This export does not add judgments, grant coverage, rewrite a trial, or change a score.

Incomplete batches can also be exported: an absent `trial.json` produces an explicit `missing` entry in the evaluator mapping, with no invented review packet or coverage. The export reports expected slots, actual packets and missing slots separately. Keep the original plan when scoring; exporting the available reviews does not remove missing attempts from the denominator. A present trial with invalid or missing referenced evidence still fails integrity verification.
