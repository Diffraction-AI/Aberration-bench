import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../examples/demo.ts';
import { score } from '../src/score.ts';
import { digest, makePlan } from '../src/plan.ts';
import { Trial } from '../src/contracts.ts';
function result(d = demo()) {
  return score(d.plan, d.suite, d.trials, d.adjudications)[0];
}

test('Synthetic perfect reviews require verified coverage and complete measured cost', () => {
  const r = result();
  assert.equal(r.recall, 1);
  assert.equal(r.reportPrecision, 1);
  assert.equal(r.cleanSuccessRate, 1);
  assert.equal(r.measuredWithinBudgetSuccessRate, 1);
  assert.equal(r.releaseCertified, false);
  assert.ok(Math.abs(r.totalMeasuredUsd! - 0.42) < 1e-10);
});
test('Missing trials remain in denominators, invalidate total cost, and create false negatives', () => {
  const d = demo();
  d.trials = [];
  d.adjudications = [];
  const r = result(d);
  assert.equal(r.missing, 2);
  assert.equal(r.falseNegatives, 1);
  assert.equal(r.qualitySuccessRate, 0);
  assert.equal(r.totalMeasuredUsd, null);
  assert.equal(r.completedP95Seconds, null);
});
test('Unknown and estimated charges never become measured zero or pass the measured budget gate', () => {
  for (const basis of ['unknown', 'estimated'] as const) {
    const d = demo();
    for (const t of d.trials)
      t.charges[0] = {
        component: 'model',
        basis,
        usd: basis === 'unknown' ? null : 0.1,
        receipt: null,
      };
    const r = result(d);
    assert.equal(r.qualitySuccessRate, 1);
    assert.equal(r.measuredWithinBudgetSuccessRate, null);
    assert.equal(r.totalMeasuredUsd, null);
  }
});
test('Incomplete component accounting is unknown', () => {
  const d = demo();
  d.trials.forEach((t) => t.charges.pop());
  assert.equal(result(d).costComplete, false);
  assert.equal(result(d).measuredModelUsd, 0.4);
  assert.equal(result(d).measuredInfrastructureUsd, null);
});
test('Deadline and money overshoots fail the budget metric independently of quality', () => {
  for (const mode of ['time', 'cost']) {
    const d = demo();
    for (const t of d.trials) {
      if (mode === 'time') t.elapsedSeconds = 601;
      else t.charges[0].usd = 2;
    }
    assert.equal(result(d).measuredWithinBudgetSuccessRate, 0);
    assert.equal(result(d).qualitySuccessRate, 1);
  }
});
test('Timeouts cannot masquerade as completed reviews or disappear from cost totals', () => {
  const d = demo();
  d.trials.forEach((t) => (t.status = 'timeout'));
  assert.equal(result(d).qualitySuccessRate, 0);
  assert.equal(result(d).failed, 2);
  assert.equal(result(d).costComplete, true);
  assert.equal(result(d).completedP50Seconds, null);
});
test('Quiet but unexplored clean reviews fail', () => {
  const d = demo();
  d.adjudications.forEach((a) => (a.coveredTargets = []));
  assert.equal(result(d).cleanSuccessRate, 0);
});
test('Correct-looking text without independently verified evidence cannot earn a true positive', () => {
  const d = demo();
  d.adjudications.find((a) => a.judgments.length)!.judgments[0].evidenceVerified = false;
  assert.throws(() => result(d), /verified evidence/);
});
test('Duplicates earn no extra recall and reduce report precision', () => {
  const d = demo(),
    trial = d.trials.find((t) => t.review.findings.length)!;
  trial.review.findings.push({ ...trial.review.findings[0], id: 'f2' });
  const a = d.adjudications.find((a) => a.slotId === trial.slotId)!;
  a.judgments.push({ ...a.judgments[0], findingId: 'f2', label: 'duplicate', duplicateOf: 'f1' });
  const r = result(d);
  assert.equal(r.recall, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.reportPrecision, 0.5);
});
test('Unresolved findings prevent completed adjudication and successful reviews', () => {
  const d = demo();
  d.adjudications.find((a) => a.judgments.length)!.judgments = [];
  assert.equal(result(d).unresolved, 1);
  assert.equal(result(d).adjudicationComplete, false);
});
test('Unknown true positives must be resolved, not silently scored false', () => {
  const d = demo();
  d.adjudications.find((a) => a.judgments.length)!.judgments[0].defectId = 'new';
  assert.throws(() => result(d), /resolve novel defects/);
});
test('Duplicate and unscheduled records are rejected', () => {
  const d = demo();
  d.trials.push(d.trials[0]);
  assert.throws(() => result(d), /Duplicate trial/);
  const e = demo();
  e.trials[0].slotId = 'unscheduled';
  assert.throws(() => result(e), /Unscheduled/);
});
test('Tampered or cherry-picked plans are rejected', () => {
  const d = demo();
  d.plan.slots.pop();
  assert.throws(() => result(d), /complete trial matrix/);
  const e = demo();
  e.suite.version = 'changed';
  assert.throws(() => result(e), /complete trial matrix/);
});
test('Candidate and empty suites cannot be scheduled', () => {
  const d = demo();
  d.suite.cases[0].admission.status = 'candidate';
  assert.throws(
    () => makePlan(d.suite, d.plan.submissions, 'prepared', d.plan.profile, 1, 0),
    /not admitted/,
  );
  d.suite.cases = [];
  assert.throws(
    () => makePlan(d.suite, d.plan.submissions, 'prepared', d.plan.profile, 1, 0),
    /No admitted cases/,
  );
});
test('Bad numerical charges and unsupported labels are rejected', () => {
  const d = demo();
  d.trials[0].charges[0].usd = -1;
  assert.throws(() => Trial.parse(d.trials[0]));
  d.trials[0].charges[0].usd = NaN;
  assert.throws(() => Trial.parse(d.trials[0]));
});
test('Stable digest ignores object key ordering', () =>
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 })));

test('A false report on a clean change is penalized even with complete coverage', () => {
  const d = demo();
  const bad = d.trials.find((t) => t.review.findings.length)!;
  const clean = d.trials.find((t) => !t.review.findings.length)!;
  clean.review.findings.push({ ...bad.review.findings[0], id: 'false-report' });
  d.adjudications
    .find((a) => a.slotId === clean.slotId)!
    .judgments.push({
      findingId: 'false-report',
      label: 'false-positive',
      defectId: null,
      duplicateOf: null,
      evidenceVerified: false,
      baselineVerified: false,
      rationale: 'No introduced regression.',
    });
  const r = result(d);
  assert.equal(r.falsePositives, 1);
  assert.equal(r.reportPrecision, 0.5);
  assert.equal(r.cleanSuccessRate, 0);
  assert.equal(r.qualitySuccessRate, 0.5);
});
test('Release judgments require two independent reviewer identities', () => {
  const d = demo();
  d.suite.split = 'release';
  d.plan = makePlan(d.suite, d.plan.submissions, d.plan.track, d.plan.profile, 1, 7);
  assert.equal(result(d).adjudicationComplete, false);
  d.adjudications.forEach((a) => a.reviewers.push('synthetic-reviewer-two'));
  assert.equal(result(d).adjudicationComplete, true);
  assert.equal(result(d).releaseCertified, false);
});
