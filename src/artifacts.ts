import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { Trial, Suite, Artifact } from './contracts.ts';
import { z } from 'zod';

export function verifyReferences(artifacts: z.infer<typeof Artifact>[], rootInput: string): number {
  const root = realpathSync(rootInput);
  for (const artifact of artifacts) {
    if (isAbsolute(artifact.path)) throw new Error('Artifact paths must be relative');
    const file = realpathSync(resolve(root, artifact.path));
    const fromRoot = relative(root, file);
    if (fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot))
      throw new Error(`Artifact escapes root: ${artifact.path}`);
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (hash !== artifact.sha256) throw new Error(`Artifact hash mismatch: ${artifact.path}`);
  }
  return artifacts.length;
}

export function verifySuiteArtifacts(suiteInput: unknown, root: string): number {
  const suite = Suite.parse(suiteInput);
  if (suite.cases.some((c) => c.admission.oracleArtifacts.length === 0))
    throw new Error('Every runnable case needs preserved oracle evidence');
  return verifyReferences(
    suite.cases.flatMap((c) => c.admission.oracleArtifacts),
    root,
  );
}

export function verifyArtifacts(trialInput: unknown, rootInput: string): number {
  const trial = Trial.parse(trialInput);
  const artifacts = [
    trial.transcript,
    ...trial.charges.flatMap((c) => (c.receipt ? [c.receipt] : [])),
    ...trial.review.findings.flatMap((f) => f.evidence),
  ];
  return verifyReferences(artifacts, rootInput);
}
