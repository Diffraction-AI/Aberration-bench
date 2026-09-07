import { createHash } from 'node:crypto';
import { Case, Plan, Suite, Submission, Profile, Track } from './contracts.ts';
import type { PlanData, SuiteData, SubmissionData } from './contracts.ts';

export function digest(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, item]) => [k, canonical(item)]),
      );
    return v;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function makePlan(
  suiteInput: SuiteData,
  submissionsInput: SubmissionData[],
  track: string,
  profile: unknown,
  repetitions: number,
  seed: number,
): PlanData {
  const suite = Suite.parse(suiteInput);
  const submissions = submissionsInput.map((s) => Submission.parse(s));
  if (!suite.cases.length)
    throw new Error('No admitted cases. Reproduce and admit cases before planning a real run.');
  for (const c of suite.cases) {
    Case.parse(c);
    if (
      c.admission.status !== 'admitted' &&
      !(suite.split === 'diagnostic' && c.admission.status === 'verified')
    )
      throw new Error(`Case ${c.id} is not admitted`);
  }
  if (new Set(submissions.map((s) => s.id)).size !== submissions.length)
    throw new Error('Duplicate submission IDs');
  const slots = submissions.flatMap((s) =>
    suite.cases.flatMap((c) =>
      Array.from({ length: repetitions }, (_, repetition) => ({
        id: digest([s.id, c.id, repetition]).slice(0, 24),
        submissionId: s.id,
        caseId: c.id,
        repetition,
      })),
    ),
  );
  // Stable pseudorandom order reduces ordering effects; the seed is in the plan.
  slots.sort((a, b) => {
    const x = digest([seed, a.id]),
      y = digest([seed, b.id]);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return Plan.parse({
    schemaVersion: 1,
    suiteDigest: digest(suite),
    track: Track.parse(track),
    profile: Profile.parse(profile),
    repetitions,
    seed,
    submissions,
    slots,
  });
}

export function validatePlan(plan: PlanData, suite: SuiteData): void {
  const expected = makePlan(
    suite,
    plan.submissions,
    plan.track,
    plan.profile,
    plan.repetitions,
    plan.seed,
  );
  if (digest(plan) !== digest(expected))
    throw new Error('Plan does not match its suite and complete trial matrix');
}
