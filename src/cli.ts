import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Config, Suite, Submission, Plan, Review, Trial, Adjudication } from './contracts.ts';
import { makePlan } from './plan.ts';
import { score } from './score.ts';
import { verifyArtifacts } from './artifacts.ts';
import { demo } from '../examples/demo.ts';
import { verifyDiagnostics } from './tasks/verify.ts';
import { exportHarbor } from './tasks/harbor.ts';
import { runSingle } from './runtime/run.ts';
import { runBatch } from './runtime/batch.ts';
import { doctor } from './runtime/doctor.ts';
import { markdownReport } from './report.ts';
import { adjudicationPacket } from './adjudication.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const [command, ...args] = process.argv.slice(2);
try {
  const config = Config.parse(read(resolve(root, 'config/benchmark.json')));
  switch (command) {
    case 'validate': {
      const suite = Suite.parse(read(args[0] ?? resolve(root, config.suite)));
      print({
        valid: true,
        suite: suite.id,
        cases: suite.cases.length,
        admitted: suite.cases.filter((c) => c.admission.status === 'admitted').length,
        runnable:
          suite.cases.length > 0 &&
          suite.cases.every(
            (c) =>
              c.admission.status === 'admitted' ||
              (suite.split === 'diagnostic' && c.admission.status === 'verified'),
          ),
        status: suite.cases.length
          ? 'Manifest validation only; verify oracle artifacts separately.'
          : 'No admitted cases yet.',
      });
      break;
    }
    case 'doctor':
      print(await doctor());
      break;
    case 'verify-diagnostics': {
      if (args.length !== 1) throw new Error('Usage: verify-diagnostics OUTPUT_DIRECTORY');
      const suite = await verifyDiagnostics(args[0]);
      print({ suite: suite.id, cases: suite.cases.length, split: suite.split });
      break;
    }
    case 'export-harbor': {
      if (args.length !== 2) throw new Error('Usage: export-harbor SUITE.json OUTPUT_DIRECTORY');
      print(exportHarbor(args[0], args[1]));
      break;
    }
    case 'run': {
      if (args.length < 4 || args.length > 6)
        throw new Error(
          'Usage: run SUITE.json ADAPTER.json OUTPUT_DIRECTORY CASE_ID [prepared|end-to-end] [PROFILE]',
        );
      const profile = config.profiles.find((p) => p.id === (args[5] ?? config.primaryProfile));
      if (!profile) throw new Error('Unknown profile');
      const track = z.enum(['prepared', 'end-to-end']).parse(args[4] ?? config.primaryTrack);
      const trial = await runSingle(args[0], args[1], args[2], args[3], track, profile);
      print({
        status: trial.status,
        findings: trial.review.findings.length,
        elapsedSeconds: trial.elapsedSeconds,
        output: resolve(args[2]),
      });
      if (trial.status !== 'completed') process.exitCode = 1;
      break;
    }
    case 'batch': {
      if (args.length !== 2) throw new Error('Usage: batch EXPERIMENT.json OUTPUT_DIRECTORY');
      print(await runBatch(args[0], args[1]));
      break;
    }
    case 'report': {
      if (args.length !== 4)
        throw new Error('Usage: report PLAN.json SUITE.json TRIALS.json ADJUDICATIONS.json');
      process.stdout.write(
        markdownReport(
          Plan.parse(read(args[0])),
          Suite.parse(read(args[1])),
          z.array(Trial).parse(read(args[2])),
          z.array(Adjudication).parse(read(args[3])),
        ),
      );
      break;
    }
    case 'adjudicate': {
      if (args.length !== 3)
        throw new Error('Usage: adjudicate PLAN.json RUNS_DIRECTORY OUTPUT_DIRECTORY');
      print(adjudicationPacket(Plan.parse(read(args[0])), args[1], args[2]));
      break;
    }
    case 'plan': {
      if (args.length < 4)
        throw new Error('Usage: plan SUITE.json SUBMISSIONS.json TRACK PROFILE [REPETITIONS]');
      const profile = config.profiles.find((p) => p.id === args[3]);
      if (!profile) throw new Error('Unknown profile');
      print(
        makePlan(
          Suite.parse(read(args[0])),
          z.array(Submission).parse(read(args[1])),
          args[2],
          profile,
          args[4] ? Number(args[4]) : config.pilotRepetitions,
          config.seed,
        ),
      );
      break;
    }
    case 'score': {
      if (args.length !== 4)
        throw new Error('Usage: score PLAN.json SUITE.json TRIALS.json ADJUDICATIONS.json');
      print(
        score(
          Plan.parse(read(args[0])),
          Suite.parse(read(args[1])),
          z.array(Trial).parse(read(args[2])),
          z.array(Adjudication).parse(read(args[3])),
        ),
      );
      break;
    }
    case 'verify-artifacts': {
      if (args.length !== 2) throw new Error('Usage: verify-artifacts TRIAL.json ARTIFACT_ROOT');
      print({
        verifiedReferences: verifyArtifacts(read(args[0]), args[1]),
        semanticVerification: 'Requires independent adjudication.',
      });
      break;
    }
    case 'schema': {
      const schemas = {
        review: Review,
        trial: Trial,
        adjudication: Adjudication,
        suite: Suite,
        plan: Plan,
        submission: Submission,
      };
      const schema = schemas[args[0] as keyof typeof schemas];
      if (!schema) throw new Error('Schemas: review, trial, adjudication, suite, plan, submission');
      print(z.toJSONSchema(schema));
      break;
    }
    case 'demo': {
      const d = demo();
      print({
        warning: 'SYNTHETIC ACCOUNTING EXAMPLE. NOT A HARNESS COMPARISON OR MEASURED RESULT.',
        results: score(d.plan, d.suite, d.trials, d.adjudications),
      });
      break;
    }
    default:
      throw new Error(
        'Commands: doctor, verify-diagnostics, export-harbor, run, batch, adjudicate, report, validate, plan, score, verify-artifacts, schema, demo. See README.md.',
      );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
