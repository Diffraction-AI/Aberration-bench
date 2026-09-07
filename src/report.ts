import { readFileSync } from 'node:fs';
import { score } from './score.ts';
import type { PlanData, SuiteData, TrialData, AdjudicationData } from './contracts.ts';
import { z } from 'zod';
const reporting = z
  .strictObject({
    bootstrapSamples: z.int().positive(),
    confidence: z.number().min(0.5).max(0.999),
    seed: z.int(),
    minimumFamiliesForInterval: z.int().min(2),
  })
  .parse(JSON.parse(readFileSync(new URL('../config/reporting.json', import.meta.url), 'utf8')));
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pairedIntervals(
  plan: PlanData,
  suite: SuiteData,
  trials: TrialData[],
  judgments: AdjudicationData[],
  first: string,
  second: string,
) {
  const summaries = score(plan, suite, trials, judgments);
  const a = summaries.find((s) => s.submissionId === first),
    b = summaries.find((s) => s.submissionId === second);
  if (!a || !b || first === second) throw new Error('Choose two distinct scheduled submissions');
  const caseFamily = new Map(suite.cases.map((c) => [c.id, c.family]));
  const families = [...new Set(caseFamily.values())].sort();
  const allJudged = a.adjudicationComplete && b.adjudicationComplete;
  const observed = a.qualitySuccessRate! - b.qualitySuccessRate!;
  if (!allJudged || families.length < reporting.minimumFamiliesForInterval)
    return {
      metric: 'quality-success-rate',
      difference: allJudged ? observed : null,
      interval: null,
      families: families.length,
      reason: !allJudged ? 'Incomplete adjudication' : 'Too few independent families',
      releaseCertified: false,
    };
  const paired = families.map((family) => ({
    a: a.rows.filter((r) => caseFamily.get(r.caseId) === family),
    b: b.rows.filter((r) => caseFamily.get(r.caseId) === family),
  }));
  const rng = random(reporting.seed),
    samples: number[] = [];
  for (let i = 0; i < reporting.bootstrapSamples; i++) {
    let successesA = 0,
      successesB = 0,
      totalA = 0,
      totalB = 0;
    for (let j = 0; j < families.length; j++) {
      const family = paired[Math.floor(rng() * paired.length)];
      successesA += family.a.filter((r) => r.qualitySuccess).length;
      totalA += family.a.length;
      successesB += family.b.filter((r) => r.qualitySuccess).length;
      totalB += family.b.length;
    }
    samples.push(successesA / totalA - successesB / totalB);
  }
  samples.sort((x, y) => x - y);
  const alpha = (1 - reporting.confidence) / 2;
  return {
    metric: 'quality-success-rate',
    difference: observed,
    interval: [
      samples[Math.floor(alpha * samples.length)],
      samples[Math.min(samples.length - 1, Math.ceil((1 - alpha) * samples.length) - 1)],
    ],
    confidence: reporting.confidence,
    families: families.length,
    bootstrapSamples: reporting.bootstrapSamples,
    method:
      'Paired percentile bootstrap clustered by defect/project family; all repeats and controls remain together.',
    releaseCertified: false,
  };
}
export function markdownReport(
  plan: PlanData,
  suite: SuiteData,
  trials: TrialData[],
  judgments: AdjudicationData[],
) {
  const summaries = score(plan, suite, trials, judgments);
  const percent = (n: number | null) => (n === null ? 'Unknown' : `${(100 * n).toFixed(1)}%`);
  const dollars = (n: number | null) => (n === null ? 'Unknown' : `$${n.toFixed(4)}`);
  const label = (s: string) => s.replace(/[|<>\r\n]/g, ' ');
  const lines = [
    `# Aberration-bench — ${label(suite.id)}`,
    '',
    `Split: **${suite.split}**. Track: **${plan.track}**. Profile: **${plan.profile.id}**.`,
    '',
    '**Uncertified evaluation report.** Diagnostic or open development results do not establish superiority on an independent release set.',
    '',
    '| Submission | Scheduled | Missing / failed | Recall | Report precision | Quality success | Within measured budget | Measured model cost | Total measured cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const s of summaries)
    lines.push(
      `| ${label(s.submissionId)} | ${s.scheduled} | ${s.missing} / ${s.failed} | ${s.adjudicationComplete ? percent(s.recall) : 'Pending'} | ${s.adjudicationComplete ? percent(s.reportPrecision) : 'Pending'} | ${s.adjudicationComplete ? percent(s.qualitySuccessRate) : 'Pending adjudication'} | ${s.adjudicationComplete ? percent(s.measuredWithinBudgetSuccessRate) : 'Pending adjudication'} | ${dollars(s.measuredModelUsd)} | ${dollars(s.totalMeasuredUsd)} |`,
    );
  lines.push(
    '',
    'Unknown/subscription costs are not zero. Completed-run latency percentiles exclude failed/timed-out attempts and must be read with those failure counts.',
    '',
  );
  if (plan.submissions.length === 2) {
    const ci = pairedIntervals(
      plan,
      suite,
      trials,
      judgments,
      plan.submissions[0].id,
      plan.submissions[1].id,
    );
    lines.push(
      'Paired quality-success comparison:',
      '',
      '```json',
      JSON.stringify(ci, null, 2),
      '```',
      '',
    );
  }
  return lines.join('\n');
}
