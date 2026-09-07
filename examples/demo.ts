// Synthetic accounting data ONLY. No model was invoked and these are not benchmark results.
import type { SuiteData, SubmissionData, TrialData, AdjudicationData } from '../src/contracts.ts';
import { makePlan } from '../src/plan.ts';
const hash = 'a'.repeat(64);
const artifact = { path: 'synthetic.txt', sha256: hash, kind: 'log' as const };
export function demo() {
  const suite: SuiteData = {
    id: 'synthetic-demo',
    version: '0',
    split: 'development',
    cases: [
      {
        id: 'demo-change',
        family: 'demo',
        kind: 'regression',
        source: {
          repository: 'example/example',
          baseSha: 'a'.repeat(40),
          headSha: 'b'.repeat(40),
          license: 'MIT',
        },
        taskDigest: hash,
        requiredTargets: ['chromium-mobile'],
        expectedDefectIds: ['demo-defect'],
        admission: {
          status: 'admitted',
          oracleArtifacts: [artifact, { ...artifact, path: 'synthetic-head.txt' }],
          reviewers: ['synthetic-reviewer-one', 'synthetic-reviewer-two'],
        },
      },
      {
        id: 'demo-clean',
        family: 'demo',
        kind: 'clean',
        source: {
          repository: 'example/example',
          baseSha: 'a'.repeat(40),
          headSha: 'a'.repeat(40),
          license: 'MIT',
        },
        taskDigest: hash,
        requiredTargets: ['chromium-mobile'],
        expectedDefectIds: [],
        admission: {
          status: 'admitted',
          oracleArtifacts: [artifact, { ...artifact, path: 'synthetic-head.txt' }],
          reviewers: ['synthetic-reviewer-one', 'synthetic-reviewer-two'],
        },
      },
    ],
  };
  const submissions: SubmissionData[] = [
    {
      id: 'synthetic-adapter',
      harness: 'none',
      harnessVersion: '0',
      models: ['none'],
      configurationDigest: hash,
      promptDigest: hash,
      toolchainDigest: hash,
    },
  ];
  const plan = makePlan(
    suite,
    submissions,
    'prepared',
    { id: 'standard', maxUsd: 1, maxSeconds: 600 },
    1,
    7,
  );
  const trials: TrialData[] = plan.slots.map((slot) => ({
    slotId: slot.id,
    status: 'completed',
    elapsedSeconds: 120,
    setupSeconds: 0,
    charges: [
      { component: 'model', basis: 'measured', usd: 0.2, receipt: artifact },
      { component: 'infrastructure', basis: 'measured', usd: 0.01, receipt: artifact },
    ],
    transcript: artifact,
    review: {
      findings:
        slot.caseId === 'demo-clean'
          ? []
          : [
              {
                id: 'f1',
                title: 'Synthetic finding',
                description: 'Synthetic accounting example.',
                reproduction: ['Open the example'],
                expected: 'Control visible',
                actual: 'Control hidden',
                targets: ['chromium-mobile'],
                evidence: [artifact],
              },
            ],
      limitations: [],
    },
  }));
  const adjudications: AdjudicationData[] = trials.map((t) => ({
    slotId: t.slotId,
    reviewers: ['synthetic-reviewer'],
    coveredTargets: ['chromium-mobile'],
    judgments: t.review.findings.map((f) => ({
      findingId: f.id,
      label: 'true-positive',
      defectId: 'demo-defect',
      duplicateOf: null,
      evidenceVerified: true,
      baselineVerified: true,
      rationale: 'Synthetic label for testing.',
    })),
  }));
  return { suite, plan, trials, adjudications };
}
