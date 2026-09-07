import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDiagnostics } from '../src/tasks/verify.ts';
import { exportHarbor } from '../src/tasks/harbor.ts';
import { verifySuiteArtifacts } from '../src/artifacts.ts';
import { runBatch } from '../src/runtime/batch.ts';
import { saveJson } from '../src/runtime/files.ts';
import { root } from '../src/runtime/config.ts';

test('All diagnostic regressions and controls reproduce across the real six-target matrix; batch resumes intact', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aberration-browsers-'));
  try {
    const suite = await verifyDiagnostics(join(directory, 'verified'));
    assert.equal(suite.cases.length, 6);
    assert.equal(verifySuiteArtifacts(suite, join(directory, 'verified')), 6);
    assert.ok(
      suite.cases.every((c) => c.admission.status === 'verified' && c.requiredTargets.length === 6),
    );
    const exported = exportHarbor(
      join(directory, 'verified/suite.json'),
      join(directory, 'harbor'),
    );
    assert.equal(exported.length, 6);
    for (const c of suite.cases) {
      const names = readdirSync(join(directory, 'harbor', c.id, 'environment'), {
        recursive: true,
      }).map(String);
      assert.ok(names.every((n) => !/(evaluator|oracle|solution|tests|\.git)/.test(n)));
      assert.match(
        readFileSync(join(directory, 'harbor', c.id, 'task.toml'), 'utf8'),
        /network_mode = "no-network"/,
      );
    }
    const experiment = join(directory, 'experiment.json');
    saveJson(experiment, {
      suite: 'verified/suite.json',
      submissions: [join(root, 'config/submissions/reference.json')],
      track: 'prepared',
      profile: 'standard',
      repetitions: 1,
      seed: 1,
      maxApiAllocationUsd: 0,
      cases: ['a01', 'a02'],
    });
    const first = await runBatch(experiment, join(directory, 'runs'));
    assert.equal(first.collected, 2);
    const before = readFileSync(join(directory, 'runs/trials.json'), 'utf8');
    const second = await runBatch(experiment, join(directory, 'runs'));
    assert.equal(second.collected, 2);
    assert.equal(readFileSync(join(directory, 'runs/trials.json'), 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
