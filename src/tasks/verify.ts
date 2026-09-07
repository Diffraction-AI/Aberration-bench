import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTask, recipes, sourceBlob } from './build.ts';
import { BrowserSession } from '../runtime/browser.ts';
import { diagnose } from '../../evaluator/oracles/diagnostic.ts';
import { saveArtifact, saveJson } from '../runtime/files.ts';
import { Suite } from '../contracts.ts';
import { runtime } from '../runtime/config.ts';
export async function verifyDiagnostics(outputInput: string, taskIds = recipes.map((r) => r.id)) {
  const output = resolve(outputInput);
  mkdirSync(output, { recursive: true });
  const cases = [];
  for (const id of taskIds) {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) throw new Error(`Unknown task ${id}`);
    const directory = join(output, id);
    mkdirSync(directory);
    const { task, taskDigest } = buildTask(id, join(directory, 'public'));
    const artifactRoot = join(directory, 'artifacts');
    const session = new BrowserSession(task, artifactRoot);
    let result;
    try {
      await session.start();
      result = await diagnose(session);
    } finally {
      await session.close();
      saveArtifact(
        artifactRoot,
        'trajectory.json',
        JSON.stringify(session.events, null, 2),
        'trace',
      );
    }
    if (
      JSON.stringify(result.review.findings.map((f) => f.id).sort()) !==
      JSON.stringify([...recipe.expectedDefectIds].sort())
    )
      throw new Error(`Unexpected diagnostic outcome in ${id}`);
    const oracle = saveArtifact(
      artifactRoot,
      'oracle.json',
      JSON.stringify(result, null, 2),
      'oracle',
    );
    cases.push({
      id,
      family: recipe.family,
      kind: recipe.kind,
      source: {
        repository: 'Diffraction-AI/Aberration-bench',
        revisionKind: 'git-blob',
        baseSha: sourceBlob(task.source.base),
        headSha: sourceBlob(task.source.candidate),
        license: 'MIT',
      },
      taskDigest,
      requiredTargets: task.targets.map((t) => t.id),
      expectedDefectIds: recipe.expectedDefectIds,
      admission: {
        status: 'verified',
        oracleArtifacts: [{ ...oracle, path: `${id}/artifacts/${oracle.path}` }],
        reviewers: [],
      },
    });
    saveJson(join(directory, 'verification.json'), {
      id,
      automated: true,
      independentlyAdmitted: false,
      taskDigest,
      oracle,
      defects: result.review.findings.map((f) => f.id),
      coveredTargets: result.coveredTargets,
    });
    process.stderr.write(
      `Verified ${id}: ${result.review.findings.length} regression(s), ${task.targets.length} browser/viewport targets\n`,
    );
  }
  const suite = Suite.parse({
    id: 'aberration-diagnostic',
    version: '0.1.0',
    split: 'diagnostic',
    cases,
  });
  saveJson(join(output, 'suite.json'), suite);
  saveJson(join(output, 'environment.json'), {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(
      readFileSync(new URL('../../node_modules/playwright/package.json', import.meta.url), 'utf8'),
    ).version,
    targets: runtime.targets,
  });
  return suite;
}
