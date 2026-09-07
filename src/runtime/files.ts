import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Artifact } from '../contracts.ts';
import type { z } from 'zod';
export function saveArtifact(
  root: string,
  name: string,
  value: string | Buffer,
  kind: z.infer<typeof Artifact>['kind'],
) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
  return Artifact.parse({
    path: name,
    sha256: createHash('sha256').update(value).digest('hex'),
    kind,
  });
}
export function jsonFile(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function saveJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
