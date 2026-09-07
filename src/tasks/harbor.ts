import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { root, runtime } from '../runtime/config.ts';
import { PublicTask } from '../runtime/browser.ts';
import { jsonFile, saveJson } from '../runtime/files.ts';
import { Suite } from '../contracts.ts';
import { digest } from '../plan.ts';
import { verifySuiteArtifacts } from '../artifacts.ts';

export function exportHarbor(suitePath: string, outputInput: string) {
  const suite = Suite.parse(jsonFile(suitePath));
  verifySuiteArtifacts(suite, dirname(resolve(suitePath)));
  const output = resolve(outputInput);
  mkdirSync(output, { recursive: false });
  const copied = [
    'package.json',
    'package-lock.json',
    'src/contracts.ts',
    'src/runtime/browser.ts',
    'src/runtime/config.ts',
    'src/runtime/files.ts',
    'browser/mcp.ts',
    'config/runtime.json',
  ];
  const index = [];
  for (const c of suite.cases) {
    if (c.admission.status === 'candidate')
      throw new Error('Harbor export requires verified diagnostics or admitted cases');
    const task = PublicTask.parse(
      jsonFile(join(dirname(resolve(suitePath)), c.id, 'public/task.json')),
    );
    if (digest(task) !== c.taskDigest) throw new Error('Task digest mismatch');
    const directory = join(output, c.id),
      environment = join(directory, 'environment');
    mkdirSync(environment, { recursive: true });
    for (const relative of copied) {
      const dest = join(environment, relative);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, relative), dest);
    }
    saveJson(join(environment, 'task.json'), task);
    // Application image build context is an allowlist; no benchmark root, evaluator, tests, solutions, or git history.
    writeFileSync(
      join(environment, 'Dockerfile'),
      `FROM ${runtime.harbor.image}\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev --ignore-scripts\nCOPY src ./src\nCOPY browser ./browser\nCOPY config ./config\nCOPY task.json ./task.json\nRUN node --version\n`,
    );
    writeFileSync(
      join(directory, 'instruction.md'),
      readFileSync(join(root, 'prompts/review.md'), 'utf8') +
        '\n\n' +
        task.description +
        '\n' +
        task.context +
        '\nUse the aberration browser MCP tool. Its source action describes the exact app snapshots and targets. Submit the completed report through its submit action. The collector writes /logs/artifacts/review.json.\n',
    );
    writeFileSync(
      join(directory, 'task.toml'),
      `schema_version = "1.4"\nartifacts = ["/logs/artifacts/"]\n\n[task]\nname = "aberration/${c.id}"\nversion = "0.1.0"\ndescription = "Review a proposed web application change"\n\n[agent]\ntimeout_sec = ${runtime.harbor.timeoutSeconds}\n\n[verifier]\ntimeout_sec = 120\n\n[environment]\ncpus = ${runtime.harbor.cpu}\nmemory_mb = ${runtime.harbor.memoryMb}\nnetwork_mode = "no-network"\n\n[[environment.mcp_servers]]\nname = "aberration"\ntransport = "stdio"\ncommand = "node"\nargs = ["/app/browser/mcp.ts", "--task", "/app/task.json", "/logs/artifacts"]\n`,
    );
    mkdirSync(join(directory, 'solution'));
    mkdirSync(join(directory, 'tests'));
    // Oracle is deliberately shipped only through Harbor's solution channel, never the participant image.
    writeFileSync(
      join(directory, 'solution/diagnostic.ts'),
      readFileSync(join(root, 'evaluator/oracles/diagnostic.ts'), 'utf8')
        .replaceAll('../../src/contracts.ts', '/app/src/contracts.ts')
        .replaceAll('../../src/runtime/files.ts', '/app/src/runtime/files.ts'),
    );
    writeFileSync(
      join(directory, 'solution/solve.mjs'),
      `import {readFileSync} from 'node:fs';\nimport {BrowserSession} from '/app/src/runtime/browser.ts';\nimport {saveJson} from '/app/src/runtime/files.ts';\nimport {diagnose} from './diagnostic.ts';\nconst session=new BrowserSession(JSON.parse(readFileSync('/app/task.json','utf8')),'/logs/artifacts');\ntry {await session.start();const result=await diagnose(session);saveJson('/logs/artifacts/review.json',result.review);}finally{await session.close();saveJson('/logs/artifacts/trajectory.json',session.events);}\n`,
    );
    writeFileSync(
      join(directory, 'solution/solve.sh'),
      '#!/bin/sh\nset -eu\nnode /solution/solve.mjs\n',
    );
    copyFileSync(join(root, 'tools/harbor-verify.py'), join(directory, 'tests/verify.py'));
    writeFileSync(
      join(directory, 'tests/test.sh'),
      '#!/bin/sh\nset -eu\npython3 /tests/verify.py\n',
    );
    index.push({ id: c.id, taskDigest: c.taskDigest, directory: c.id });
  }
  saveJson(join(output, 'export.json'), {
    suiteDigest: digest(suite),
    harborVersion: runtime.harbor.version,
    split: suite.split,
    tasks: index,
    note: 'Harbor verifier scores report validity and artifact integrity only. Quality requires separate blinded adjudication. Network is disabled until a provider-specific allowlist is configured.',
  });
  return index;
}
