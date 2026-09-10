import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
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
    const directory = join(runs, slot.id);
    const alias = randomBytes(12).toString('hex');
    if (!existsSync(join(directory, 'trial.json'))) {
      mapping.push({ alias, slotId: slot.id, caseId: slot.caseId, submissionId: slot.submissionId, status: 'missing' });
      continue;
    }
    const trial = Trial.parse(jsonFile(join(directory, 'trial.json')));
    if (trial.slotId !== slot.id) throw new Error('Trial does not match planned slot');
    verifyArtifacts(trial, join(directory, 'artifacts'));
    const dest = join(output, 'reviewer', alias);
    mkdirSync(dest);
    for (const finding of trial.review.findings)
      for (const artifact of finding.evidence) {
        const target = join(dest, 'evidence', artifact.path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(directory, 'artifacts', artifact.path), target);
      }
    // Clean reviews need observed coverage evidence too. Raw execution traces may
    // identify the participant, so keep them separate from the blinded claims.
    const coverage = join(output, 'evaluator', 'coverage', alias);
    mkdirSync(coverage, { recursive: true });
    const transcript = `transcript${extname(trial.transcript.path) || '.txt'}`;
    copyFileSync(join(directory, 'artifacts', trial.transcript.path), join(coverage, transcript));
    saveJson(join(coverage, 'index.json'), {
      alias,
      transcript: { ...trial.transcript, path: transcript },
      guidance: 'Inspect recorded browser actions/results against the case targets. Narrative coverage claims are not proof. Raw traces can reveal participant identity; adjudicate blinded claims first.',
    });
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
    packets: mapping.filter(row => row.status !== 'missing').length,
    missingSlots: mapping.filter(row => row.status === 'missing').length,
    expectedSlots: plan.slots.length,
    reviewerDirectory: join(output, 'reviewer'),
    mapping: join(output, 'evaluator/mapping.json'),
    coverageDirectory: join(output, 'evaluator/coverage'),
    instructions:
      'Give reviewers only the reviewer directory plus case reproduction materials. After blinded claim judgments, the evaluator supplies the preserved coverage traces; those traces may identify participants. Verify actual required-target actions, then resolve aliases using the evaluator mapping when saving schema-valid adjudications. Missing slots remain in the evaluator mapping and original plan; they never count as reviewed or covered. Drafts are deliberately not accepted by the scorer.',
  };
}
