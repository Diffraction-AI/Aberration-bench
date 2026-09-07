import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { Config, Suite, Trial, Adjudication } from '../contracts.ts';
import { root } from './config.ts';
import { AdapterConfig } from '../adapters/config.ts';
import { jsonFile, saveJson } from './files.ts';
import { submissionFor, runSlot } from './run.ts';
import { digest, makePlan } from '../plan.ts';
import { markdownReport } from '../report.ts';
import { verifyArtifacts, verifySuiteArtifacts } from '../artifacts.ts';
import { writeFileSync } from 'node:fs';

export const Experiment = z.strictObject({
  suite: z.string(),
  submissions: z.array(z.string()).min(1),
  track: z.enum(['prepared', 'end-to-end']),
  profile: z.string(),
  repetitions: z.int().positive(),
  seed: z.int(),
  maxApiAllocationUsd: z.number().nonnegative(),
  cases: z.array(z.string()).optional(),
});
export async function runBatch(experimentPath: string, outputInput: string) {
  const base = dirname(resolve(experimentPath)),
    experiment = Experiment.parse(jsonFile(experimentPath));
  const suitePath = resolve(base, experiment.suite),
    original = Suite.parse(jsonFile(suitePath));
  const cases = experiment.cases
    ? original.cases.filter((c) => experiment.cases!.includes(c.id))
    : original.cases;
  if (experiment.cases && cases.length !== new Set(experiment.cases).size)
    throw new Error('Unknown selected case');
  const suite = Suite.parse({ ...original, cases });
  verifySuiteArtifacts(suite, dirname(suitePath));
  const adapters = experiment.submissions.map((p) =>
    AdapterConfig.parse(jsonFile(resolve(base, p))),
  );
  const benchmark = Config.parse(jsonFile(join(root, 'config/benchmark.json')));
  const profile = benchmark.profiles.find((p) => p.id === experiment.profile);
  if (!profile) throw new Error('Unknown budget profile');
  const apiAllocation =
    adapters.filter((a) => a.access === 'api' || a.access === 'external').length *
    cases.length *
    experiment.repetitions *
    profile.maxUsd;
  if (apiAllocation > experiment.maxApiAllocationUsd)
    throw new Error(
      `Requested API/external allocation $${apiAllocation} exceeds experiment cap $${experiment.maxApiAllocationUsd}`,
    );
  const submissions = await Promise.all(adapters.map(submissionFor));
  const plan = makePlan(
    suite,
    submissions,
    experiment.track,
    profile,
    experiment.repetitions,
    experiment.seed,
  );
  const output = resolve(outputInput);
  mkdirSync(output, { recursive: true });
  if (
    existsSync(join(output, 'plan.json')) &&
    digest(jsonFile(join(output, 'plan.json'))) !== digest(plan)
  )
    throw new Error('Cannot resume with a different frozen plan');
  saveJson(join(output, 'plan.json'), plan);
  saveJson(join(output, 'suite.json'), suite);
  saveJson(join(output, 'experiment.json'), experiment);
  const trials = [],
    judgments = [];
  for (const slot of plan.slots) {
    const directory = join(output, slot.id);
    if (!existsSync(join(directory, 'trial.json'))) {
      if (existsSync(directory))
        throw new Error(
          `Incomplete collection for ${slot.id}; preserve it and resolve before resuming`,
        );
      process.stderr.write(
        `Running ${slot.submissionId} / ${slot.caseId} / repeat ${slot.repetition + 1}\n`,
      );
      await runSlot(
        plan,
        suite,
        slot.id,
        join(dirname(suitePath), slot.caseId, 'public'),
        adapters.find((a) => a.id === slot.submissionId)!,
        directory,
      );
    }
    const collected = Trial.parse(jsonFile(join(directory, 'trial.json')));
    if (collected.slotId !== slot.id) throw new Error('Stored trial does not match scheduled slot');
    if (jsonFile(join(directory, 'provenance.json')).planDigest !== digest(plan))
      throw new Error('Stored run belongs to a different plan');
    verifyArtifacts(collected, join(directory, 'artifacts'));
    trials.push(collected);
    if (existsSync(join(directory, 'adjudication.json')))
      judgments.push(Adjudication.parse(jsonFile(join(directory, 'adjudication.json'))));
    saveJson(join(output, 'trials.json'), trials);
    saveJson(join(output, 'adjudications.json'), judgments);
    writeFileSync(join(output, 'report.md'), markdownReport(plan, suite, trials, judgments));
  }
  return {
    scheduled: plan.slots.length,
    collected: trials.length,
    apiAllocationCeilingUsd: apiAllocation,
    report: join(output, 'report.md'),
  };
}
