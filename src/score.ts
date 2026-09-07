import { Plan, Suite, Trial, Adjudication } from './contracts.ts';
import type { PlanData, SuiteData, TrialData, AdjudicationData } from './contracts.ts';
import { validatePlan } from './plan.ts';

function unique<T>(items: T[], key: (item: T) => string, name: string): Map<string, T> {
  const map = new Map(items.map((item) => [key(item), item]));
  if (map.size !== items.length) throw new Error(`Duplicate ${name}`);
  return map;
}
const ratio = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function score(
  planInput: PlanData,
  suiteInput: SuiteData,
  trialInput: TrialData[],
  adjudicationInput: AdjudicationData[],
) {
  const plan = Plan.parse(planInput),
    suite = Suite.parse(suiteInput);
  validatePlan(plan, suite);
  const trials = unique(
    trialInput.map((t) => Trial.parse(t)),
    (t) => t.slotId,
    'trial IDs',
  );
  const adjudications = unique(
    adjudicationInput.map((a) => Adjudication.parse(a)),
    (a) => a.slotId,
    'adjudication IDs',
  );
  const slotIds = new Set(plan.slots.map((s) => s.id));
  for (const id of trials.keys()) if (!slotIds.has(id)) throw new Error(`Unscheduled trial ${id}`);
  for (const id of adjudications.keys())
    if (!trials.has(id)) throw new Error(`Adjudication without trial ${id}`);
  const cases = new Map(suite.cases.map((c) => [c.id, c]));

  return plan.submissions.map((submission) => {
    const rows = plan.slots
      .filter((s) => s.submissionId === submission.id)
      .map((slot) => {
        const c = cases.get(slot.caseId)!;
        const trial = trials.get(slot.id),
          adjudication = adjudications.get(slot.id);
        const base = { slotId: slot.id, caseId: c.id, repetition: slot.repetition, kind: c.kind };
        if (!trial)
          return {
            ...base,
            status: 'missing',
            truePositives: 0,
            falsePositives: 0,
            duplicates: 0,
            unresolved: 0,
            falseNegatives: c.expectedDefectIds.length,
            covered: false,
            adjudicated: false,
            qualitySuccess: false,
            withinBudgetSuccess: null,
            measuredUsd: null,
            estimatedUsd: null,
            elapsedSeconds: null,
            setupSeconds: null,
          };

        const findings = unique(trial.review.findings, (f) => f.id, 'finding IDs');
        const judgments = unique(
          adjudication?.judgments ?? [],
          (j) => j.findingId,
          'finding judgments',
        );
        const matched = new Set<string>();
        let fp = 0,
          duplicates = 0,
          unresolved = 0;
        for (const findingId of judgments.keys())
          if (!findings.has(findingId))
            throw new Error(`Judgment for nonexistent finding ${findingId}`);
        for (const [findingId, finding] of findings) {
          const j = judgments.get(findingId);
          if (!j || j.label === 'unresolved') {
            unresolved++;
            continue;
          }
          if (j.label === 'true-positive') {
            if (!j.defectId || !c.expectedDefectIds.includes(j.defectId))
              throw new Error(
                `Unknown target defect in ${findingId}; resolve novel defects before scoring`,
              );
            if (matched.has(j.defectId))
              throw new Error(
                `Defect ${j.defectId} matched twice; label additional reports duplicate`,
              );
            if (!finding.evidence.length || !j.evidenceVerified || !j.baselineVerified)
              throw new Error(
                `True positive ${findingId} lacks verified evidence or regression attribution`,
              );
            matched.add(j.defectId);
          } else if (j.label === 'false-positive') {
            if (j.defectId !== null || j.duplicateOf !== null)
              throw new Error('False positives cannot match a defect or duplicate');
            fp++;
          } else {
            const target = j.duplicateOf ? judgments.get(j.duplicateOf) : undefined;
            if (
              !target ||
              target.label !== 'true-positive' ||
              j.duplicateOf === findingId ||
              target.defectId !== j.defectId
            )
              throw new Error(
                `Duplicate ${findingId} must refer to a true positive for the same defect`,
              );
            duplicates++;
          }
        }
        const coveredTargets = new Set(adjudication?.coveredTargets ?? []);
        for (const target of coveredTargets)
          if (!c.requiredTargets.includes(target))
            throw new Error(`Unexpected coverage target ${target}`);
        const covered = c.requiredTargets.every((t) => coveredTargets.has(t));
        const adjudicated =
          Boolean(adjudication) &&
          unresolved === 0 &&
          (suite.split !== 'release' || new Set(adjudication!.reviewers).size >= 2);
        const completeCosts = ['model', 'infrastructure'].every((component) =>
          trial.charges.some((charge) => charge.component === component),
        );
        const measured = completeCosts && trial.charges.every((c) => c.basis === 'measured');
        const known = completeCosts && trial.charges.every((c) => c.usd !== null);
        const cost = trial.charges.reduce((sum, charge) => sum + (charge.usd ?? 0), 0);
        const success =
          trial.status === 'completed' &&
          adjudicated &&
          covered &&
          fp === 0 &&
          duplicates === 0 &&
          matched.size === c.expectedDefectIds.length;
        // elapsedSeconds always measures this track's full clock, including setup in end-to-end.
        return {
          ...base,
          status: trial.status,
          truePositives: matched.size,
          falsePositives: fp,
          duplicates,
          unresolved,
          falseNegatives: c.expectedDefectIds.length - matched.size,
          covered,
          adjudicated,
          qualitySuccess: success,
          withinBudgetSuccess: measured
            ? success &&
              cost <= plan.profile.maxUsd &&
              trial.elapsedSeconds <= plan.profile.maxSeconds
            : null,
          measuredUsd: measured ? cost : null,
          estimatedUsd: known && !measured ? cost : null,
          elapsedSeconds: trial.elapsedSeconds,
          setupSeconds: trial.setupSeconds,
        };
      });
    const sum = (
      key: 'truePositives' | 'falsePositives' | 'falseNegatives' | 'duplicates' | 'unresolved',
    ) => rows.reduce((total, row) => total + row[key], 0);
    const tp = sum('truePositives'),
      fp = sum('falsePositives'),
      fn = sum('falseNegatives'),
      dup = sum('duplicates');
    const clean = rows.filter((r) => r.kind === 'clean');
    const allMeasured = rows.every((r) => r.measuredUsd !== null);
    const totalUsd = allMeasured ? rows.reduce((s, r) => s + r.measuredUsd!, 0) : null;
    const successful = rows.filter((r) => r.qualitySuccess);
    const completedDurations = rows
      .filter((r) => r.status === 'completed')
      .map((r) => r.elapsedSeconds!);
    const componentTotal = (component: 'model' | 'infrastructure') => {
      let total = 0;
      for (const row of rows) {
        const charges = trials.get(row.slotId)?.charges.filter((c) => c.component === component);
        if (!charges?.length || charges.some((c) => c.basis !== 'measured')) return null;
        total += charges.reduce((sum, c) => sum + c.usd!, 0);
      }
      return total;
    };
    return {
      submissionId: submission.id,
      track: plan.track,
      profile: plan.profile.id,
      split: suite.split,
      scheduled: rows.length,
      missing: rows.filter((r) => r.status === 'missing').length,
      failed: rows.filter((r) => !['missing', 'completed'].includes(r.status)).length,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      duplicates: dup,
      unresolved: sum('unresolved'),
      reportPrecision: ratio(tp, tp + fp + dup),
      recall: ratio(tp, tp + fn),
      f1: ratio(2 * tp, 2 * tp + fp + dup + fn),
      coverageRate: ratio(rows.filter((r) => r.covered).length, rows.length),
      qualitySuccessRate: ratio(successful.length, rows.length),
      measuredWithinBudgetSuccessRate: allMeasured
        ? ratio(rows.filter((r) => r.withinBudgetSuccess).length, rows.length)
        : null,
      cleanSuccessRate: ratio(clean.filter((r) => r.qualitySuccess).length, clean.length),
      totalMeasuredUsd: totalUsd,
      measuredModelUsd: componentTotal('model'),
      measuredInfrastructureUsd: componentTotal('infrastructure'),
      measuredCostPerSuccessfulReviewUsd:
        totalUsd !== null && successful.length ? totalUsd / successful.length : null,
      completedP50Seconds: percentile(completedDurations, 0.5),
      completedP95Seconds: percentile(completedDurations, 0.95),
      adjudicationComplete: rows.every((r) => r.adjudicated),
      costComplete: allMeasured,
      // An accounting summary is never sufficient to certify a public leaderboard claim.
      releaseCertified: false,
      rows,
    };
  });
}
