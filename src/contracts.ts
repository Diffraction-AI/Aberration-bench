import { z } from 'zod';

const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sha1 = z.string().regex(/^[a-f0-9]{40}$/);
const nonnegative = z.number().finite().nonnegative();
export const Track = z.enum(['prepared', 'end-to-end']);
export const Profile = z.strictObject({
  id,
  maxUsd: nonnegative,
  maxSeconds: z.number().positive(),
});
export const Config = z.strictObject({
  version: id,
  primaryTrack: Track,
  tracks: z.array(Track).min(1),
  profiles: z.array(Profile).min(1),
  primaryProfile: id,
  pilotRepetitions: z.int().positive(),
  releaseRepetitions: z.int().positive(),
  seed: z.int(),
  candidateCatalog: id,
  suite: id,
});
export const Artifact = z.strictObject({
  path: id,
  sha256,
  kind: z.enum(['screenshot', 'video', 'trace', 'log', 'receipt', 'oracle']),
});
export const Case = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    family: id,
    kind: z.enum(['regression', 'clean']),
    source: z.strictObject({
      repository: id,
      revisionKind: z.enum(['commit', 'git-blob']).optional(),
      baseSha: sha1,
      headSha: sha1,
      license: id,
    }),
    taskDigest: sha256,
    requiredTargets: z.array(id).min(1),
    expectedDefectIds: z.array(id),
    admission: z.strictObject({
      status: z.enum(['candidate', 'verified', 'admitted']),
      oracleArtifacts: z.array(Artifact),
      reviewers: z.array(id),
    }),
  })
  .superRefine((value, ctx) => {
    if ((value.kind === 'clean') !== (value.expectedDefectIds.length === 0))
      ctx.addIssue({
        code: 'custom',
        message: 'Clean cases have no introduced defects; regression cases require at least one.',
      });
    for (const key of ['requiredTargets', 'expectedDefectIds'] as const)
      if (new Set(value[key]).size !== value[key].length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${key}` });
    if (
      value.admission.status === 'admitted' &&
      (value.admission.oracleArtifacts.length < 2 || new Set(value.admission.reviewers).size < 2)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Admission requires base/head oracle artifacts and two independent reviewers.',
      });
  });
export const Suite = z
  .strictObject({
    id,
    version: id,
    split: z.enum(['diagnostic', 'development', 'release']),
    cases: z.array(Case),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.cases.map((c) => c.id)).size !== value.cases.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate case IDs' });
  });
export const Submission = z.strictObject({
  id,
  harness: id,
  harnessVersion: id,
  models: z.array(id).min(1),
  configurationDigest: sha256,
  promptDigest: sha256,
  toolchainDigest: sha256,
});
export const Slot = z.strictObject({
  id,
  submissionId: id,
  caseId: id,
  repetition: z.int().nonnegative(),
});
export const Plan = z.strictObject({
  schemaVersion: z.literal(1),
  suiteDigest: sha256,
  track: Track,
  profile: Profile,
  repetitions: z.int().positive(),
  seed: z.int(),
  submissions: z.array(Submission).min(1),
  slots: z.array(Slot).min(1),
});
const Charge = z
  .strictObject({
    component: z.enum(['model', 'infrastructure']),
    basis: z.enum(['measured', 'estimated', 'unknown']),
    usd: nonnegative.nullable(),
    receipt: Artifact.nullable(),
  })
  .superRefine((value, ctx) => {
    if ((value.basis === 'unknown') !== (value.usd === null))
      ctx.addIssue({
        code: 'custom',
        message: 'Unknown charges must be null; known charges require an amount.',
      });
    if (value.basis === 'measured' && value.receipt === null)
      ctx.addIssue({
        code: 'custom',
        message: 'Measured charges require a receipt, including documented zero charges.',
      });
  });
export const Finding = z.strictObject({
  id,
  title: id,
  description: id,
  reproduction: z.array(id).min(1),
  expected: id,
  actual: id,
  targets: z.array(id).min(1),
  evidence: z.array(Artifact),
});
export const Review = z.strictObject({
  findings: z.array(Finding),
  limitations: z.array(id),
});
export const Trial = z.strictObject({
  slotId: id,
  status: z.enum(['completed', 'timeout', 'budget-exceeded', 'error', 'invalid-output']),
  elapsedSeconds: nonnegative,
  setupSeconds: nonnegative,
  charges: z.array(Charge),
  transcript: Artifact,
  review: Review,
});
export const Judgment = z.strictObject({
  findingId: id,
  label: z.enum(['true-positive', 'false-positive', 'duplicate', 'unresolved']),
  defectId: id.nullable(),
  duplicateOf: id.nullable(),
  evidenceVerified: z.boolean(),
  baselineVerified: z.boolean(),
  rationale: id,
});
export const Adjudication = z.strictObject({
  slotId: id,
  reviewers: z.array(id).min(1),
  coveredTargets: z.array(id),
  judgments: z.array(Judgment),
});
export type SuiteData = z.infer<typeof Suite>;
export type PlanData = z.infer<typeof Plan>;
export type TrialData = z.infer<typeof Trial>;
export type AdjudicationData = z.infer<typeof Adjudication>;
export type SubmissionData = z.infer<typeof Submission>;
