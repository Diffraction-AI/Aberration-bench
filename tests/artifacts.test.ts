import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { demo } from '../examples/demo.ts';
import { verifyArtifacts } from '../src/artifacts.ts';

test('Artifacts must exist and match their content digest; symlink escapes fail', () => {
  const root = mkdtempSync(join(tmpdir(), 'aberration-artifacts-'));
  const outside = mkdtempSync(join(tmpdir(), 'aberration-outside-'));
  try {
    const trial = demo().trials[0];
    trial.review.findings = [];
    trial.charges = [];
    writeFileSync(join(root, 'trace.txt'), 'verified');
    trial.transcript = {
      path: 'trace.txt',
      sha256: createHash('sha256').update('verified').digest('hex'),
      kind: 'trace',
    };
    assert.equal(verifyArtifacts(trial, root), 1);
    writeFileSync(join(root, 'trace.txt'), 'modified');
    assert.throws(() => verifyArtifacts(trial, root), /hash mismatch/);
    writeFileSync(join(outside, 'external.txt'), 'verified');
    symlinkSync(join(outside, 'external.txt'), join(root, 'link.txt'));
    trial.transcript.path = 'link.txt';
    assert.throws(() => verifyArtifacts(trial, root), /escapes root/);
  } finally {
    rmSync(root, { recursive: true });
    rmSync(outside, { recursive: true });
  }
});
