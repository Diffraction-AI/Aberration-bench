import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Plan, Trial } from './contracts.ts';
import type { PlanData } from './contracts.ts';
import { verifyArtifacts } from './artifacts.ts';
import { jsonFile, saveJson } from './runtime/files.ts';

// Blind presentation is separate from the evaluator-only mapping. Review prose can still reveal a system.
export function adjudicationPacket(planInput: PlanData, runsInput: string, outputInput: string) {
  const plan = Plan.parse(planInput),
    runs = resolve(runsInput),
    output = resolve(outputInput);
  mkdirSync(output);
  mkdirSync(join(output, 'reviewer'));
  mkdirSync(join(output, 'evaluator'));
  const mapping = [];
  for (const slot of plan.slots) {
    const directory = join(runs, slot.id),
      trial = Trial.parse(jsonFile(join(directory, 'trial.json')));
    if (trial.slotId !== slot.id) throw new Error('Trial does not match planned slot');
    verifyArtifacts(trial, join(directory, 'artifacts'));
    const alias = randomBytes(12).toString('hex'),
      dest = join(output, 'reviewer', alias);
    mkdirSync(dest);
    for (const finding of trial.review.findings)
      for (const artifact of finding.evidence) {
        const target = join(dest, 'evidence', artifact.path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(directory, 'artifacts', artifact.path), target);
      }
    saveJson(join(dest, 'review.json'), trial.review);
    saveJson(join(dest, 'judgment-draft.json'), {
      alias,
      caseId: slot.caseId,
      reviewers: [],
      coveredTargets: [],
      judgments: trial.review.findings.map((f) => ({
        findingId: f.id,
        label: 'unresolved',
        defectId: null,
        duplicateOf: null,
        evidenceVerified: false,
        baselineVerified: false,
        rationale: 'Pending independent reproduction and review.',
      })),
    });
    mapping.push({
      alias,
      slotId: slot.id,
      caseId: slot.caseId,
      submissionId: slot.submissionId,
      status: trial.status,
    });
  }
  saveJson(join(output, 'evaluator/mapping.json'), mapping);
  return {
    packets: mapping.length,
    reviewerDirectory: join(output, 'reviewer'),
    mapping: join(output, 'evaluator/mapping.json'),
    instructions:
      'Give reviewers only the reviewer directory plus case reproduction materials. Resolve aliases using the evaluator mapping when saving schema-valid adjudications. Drafts are deliberately not accepted by the scorer.',
  };
}
