import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { BrowserSession, PublicTask } from './browser.ts';
import { startBridge } from './bridge.ts';
import { root, runtime } from './config.ts';
import { saveJson, saveArtifact, jsonFile } from './files.ts';
import { AdapterConfig } from '../adapters/config.ts';
import type { AdapterConfigData } from '../adapters/config.ts';
import { nativeReview } from '../adapters/native.ts';
import { openrouterReview } from '../adapters/openrouter.ts';
import { externalReview } from '../adapters/external.ts';
import { diagnose } from '../../evaluator/oracles/diagnostic.ts';
import { Trial, Suite, Plan, Submission, Review } from '../contracts.ts';
import type { PlanData, SuiteData, TrialData } from '../contracts.ts';
import { digest, makePlan, validatePlan } from '../plan.ts';
import { verifyArtifacts, verifySuiteArtifacts } from '../artifacts.ts';
import { nativeEnvironment, runProcess } from './process.ts';

export async function submissionFor(configInput: unknown) {
  const config = AdapterConfig.parse(configInput);
  let version = 'aberration-0.1.0';
  if (config.adapter === 'diffraction-command') version = config.pipelineVersion!;
  if (['codex', 'claude', 'cursor'].includes(config.adapter)) {
    const output = await runProcess(config.executable ?? config.adapter, ['--version'], {
      cwd: root,
      env: nativeEnvironment(),
      timeoutMs: 10000,
    });
    if (output.code !== 0) throw new Error('Could not read harness version');
    version = (output.stdout || output.stderr).trim();
  }
  const implementation = ['src', 'browser']
    .flatMap((directory) =>
      readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => join(entry.parentPath, entry.name)),
    )
    .sort();
  return Submission.parse({
    id: config.id,
    harness: config.adapter,
    harnessVersion: version,
    models: config.models ?? [
      config.model ??
        (config.adapter === 'reference' ? 'diagnostic-no-inference' : 'native-default-unpinned'),
    ],
    configurationDigest: digest(config),
    promptDigest: digest(readFileSync(join(root, 'prompts/review.md'), 'utf8')),
    toolchainDigest: digest([
      jsonFile(join(root, 'package-lock.json')),
      implementation.map((path) => [path.slice(root.length), readFileSync(path, 'utf8')]),
      jsonFile(join(root, 'config/runtime.json')),
    ]),
  });
}
export async function runSlot(
  plan: PlanData,
  suite: SuiteData,
  slotId: string,
  publicTaskDirectory: string,
  config: AdapterConfigData,
  outputInput: string,
) {
  validatePlan(plan, suite);
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot || slot.submissionId !== config.id) throw new Error('Mismatched scheduled slot');
  const expected = plan.submissions.find((s) => s.id === config.id)!;
  const current = await submissionFor(config);
  if (digest(current) !== digest(expected))
    throw new Error('Submission changed since the plan was frozen');
  const task = PublicTask.parse(jsonFile(join(publicTaskDirectory, 'task.json'))),
    c = suite.cases.find((c) => c.id === slot.caseId)!;
  if (task.id !== c.id || digest(task) !== c.taskDigest)
    throw new Error('Task bundle differs from the verified suite');
  if (config.adapter === 'reference' && suite.split !== 'diagnostic')
    throw new Error('Reference adapter is restricted to diagnostic validation');
  const output = resolve(outputInput);
  mkdirSync(output, { recursive: false });
  const workspace = join(output, 'workspace');
  mkdirSync(workspace);
  const artifactRoot = join(output, 'artifacts');
  const session = new BrowserSession(task, artifactRoot);
  const start = performance.now();
  let ready = start,
    bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
  const events: unknown[] = [],
    charges: TrialData['charges'] = [];
  let status: TrialData['status'] = 'error',
    usage: unknown = null,
    adjudication: unknown = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const warnings = [
    'Local development execution is not a sealed filesystem or network sandbox.',
    'Native default models must be pinned before a release.',
  ];
  try {
    if (plan.track === 'end-to-end') {
      timer = setTimeout(abort, plan.profile.maxSeconds * 1000);
      timer.unref();
    }
    // Original diagnostic apps have no install/build phase. Actual startup is measured.
    await session.start();
    // External participants own their browser and evidence capture. Starting unused
    // broker browsers records minutes of duplicate idle video and adds cleanup time.
    // The same prepared source servers remain available to every adapter.
    if (config.adapter !== 'diffraction-command') {
      await session.prepare(controller.signal);
      bridge = await startBridge(session);
    }
    ready = performance.now();
    if (plan.track === 'prepared') {
      timer = setTimeout(abort, plan.profile.maxSeconds * 1000);
      timer.unref();
    }
    const checkpointDelay =
      runtime.checkpointSeconds * 1000 -
      (performance.now() - (plan.track === 'prepared' ? ready : start));
    if (checkpointDelay > 0 && runtime.checkpointSeconds < plan.profile.maxSeconds) {
      checkpointTimer = setTimeout(() => {
        try {
          saveArtifact(
            artifactRoot,
            `checkpoint-${runtime.checkpointSeconds}.json`,
            JSON.stringify(
              {
                elapsedSeconds: runtime.checkpointSeconds,
                review: session.review,
                screenshots: session.screenshots,
                events: session.events,
                note: 'Immutable partial evidence checkpoint. A missing report is not a completed five-minute review. Charges reconcile in the final collector record.',
              },
              null,
              2,
            ),
            'trace',
          );
        } catch (error) {
          events.push({ event: 'checkpoint-error', message: String(error) });
        }
      }, checkpointDelay);
      checkpointTimer.unref();
    }
    const instruction = readFileSync(join(root, 'prompts/review.md'), 'utf8');
    const prompt =
      instruction +
      '\n\n' +
      task.description +
      '\n' +
      task.context +
      '\nTargets: ' +
      JSON.stringify(task.targets) +
      '\nUse the aberration browser MCP tool (or browser function tool). Call action=source for the source snapshots. ' +
      'Base and candidate origins: ' +
      JSON.stringify(session.origins) +
      '.\nThe dollar limit only applies to measured API costs; subscription usage is reported separately. ' +
      `Time limit: ${plan.profile.maxSeconds} seconds. API budget: USD ${plan.profile.maxUsd}.\nSubmit through the browser tool's submit action when finished.\n`;
    saveJson(join(workspace, 'task.json'), task);
    saveArtifact(artifactRoot, 'prompt.txt', prompt, 'log');
    if (config.adapter === 'reference') {
      const diagnosis = await diagnose(session);
      session.review = diagnosis.review;
      adjudication = {
        slotId,
        reviewers: ['automated-diagnostic-reference'],
        coveredTargets: diagnosis.coveredTargets,
        judgments: diagnosis.review.findings.map((f) => ({
          findingId: f.id,
          label: 'true-positive',
          defectId: f.id,
          duplicateOf: null,
          evidenceVerified: true,
          baselineVerified: true,
          rationale:
            'Deterministic diagnostic differential observed in independent browser contexts; not human admission.',
        })),
      };
      status = 'completed';
      usage = { inferenceRequests: 0 };
      const receipt = saveArtifact(
        artifactRoot,
        'reference-cost.json',
        JSON.stringify({ inferenceRequests: 0, modelUsd: 0 }),
        'receipt',
      );
      charges.push({ component: 'model', basis: 'measured', usd: 0, receipt });
    } else if (['codex', 'claude', 'cursor'].includes(config.adapter)) {
      if (!bridge) throw new Error('Native browser bridge unavailable');
      const result = await nativeReview(
        config,
        workspace,
        prompt,
        bridge,
        plan.profile.maxSeconds * 1000,
        controller.signal,
      );
      events.push({ event: 'native-output', stdout: result.stdout, stderr: result.stderr });
      usage = result.usage;
      status = result.timedOut
        ? 'timeout'
        : result.overflow || result.code !== 0
          ? 'error'
          : 'completed';
      if (!session.review && result.review)
        await session.execute({ action: 'submit', review: result.review });
      if (status === 'completed' && !session.review) status = 'invalid-output';
      charges.push({ component: 'model', basis: 'unknown', usd: null, receipt: null });
      warnings.push(
        'Subscription access does not establish zero marginal cost. CLI cost estimates are not billed receipts.',
      );
    } else if (config.adapter === 'openrouter') {
      const result = await openrouterReview(
        config,
        session,
        prompt,
        plan.profile,
        controller.signal,
      );
      events.push(...result.events);
      charges.push(...result.charges);
      status = result.status;
      usage = { requests: result.requests, model: result.model };
    } else {
      const result = await externalReview(
        config,
        {
          schemaVersion: 1,
          taskDigest: c.taskDigest,
          track: plan.track,
          task,
          origins: session.origins,
          profile: plan.profile,
          artifactDirectory: artifactRoot,
        },
        workspace,
        plan.profile.maxSeconds * 1000,
        controller.signal,
      );
      events.push({ event: 'external-result', ...result });
      session.review = result.result.review;
      status = result.result.status;
      charges.push(...result.result.charges);
      warnings.push(...result.result.limitations);
    }
  } catch (error) {
    events.push({
      event: 'execution-error',
      message: error instanceof Error ? error.message : 'Execution failed',
    });
    status = controller.signal.aborted ? 'timeout' : 'error';
  } finally {
    if (timer) clearTimeout(timer);
    if (checkpointTimer) clearTimeout(checkpointTimer);
    // End of agent output clock is recorded before evidence packaging/cleanup, then separately recorded below.
    const outputReady = performance.now();
    await bridge?.close();
    await session.close();
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    if (controller.signal.aborted) status = 'timeout';
    if (!charges.some((c) => c.component === 'model'))
      charges.push({ component: 'model', basis: 'unknown', usd: null, receipt: null });
    if (!charges.some((c) => c.component === 'infrastructure'))
      charges.push({ component: 'infrastructure', basis: 'unknown', usd: null, receipt: null });
    let serialized = JSON.stringify({ events, browser: session.events, usage, warnings }, null, 2);
    for (const secret of [
      bridge?.token,
      config.credentialEnv ? process.env[config.credentialEnv] : undefined,
      process.env.OPENROUTER_API_KEY,
      process.env.CLAUDE_CODE_OAUTH_TOKEN,
    ])
      if (secret) serialized = serialized.replaceAll(secret, '[REDACTED]');
    const transcript = saveArtifact(artifactRoot, 'trajectory.json', serialized, 'trace');
    const elapsedSeconds = (performance.now() - (plan.track === 'prepared' ? ready : start)) / 1000;
    if (elapsedSeconds > plan.profile.maxSeconds && status === 'completed') status = 'timeout';
    const trial = Trial.parse({
      slotId,
      status,
      elapsedSeconds,
      setupSeconds: (ready - start) / 1000,
      charges,
      transcript,
      review: session.review ?? {
        findings: [],
        limitations: ['No valid completed report was produced.'],
      },
    });
    saveJson(join(output, 'trial.json'), trial);
    const provenance = {
      access: config.access,
      taskDigest: c.taskDigest,
      planDigest: digest(plan),
      submission: current,
      actualEffectiveModel: config.model,
      usage,
      warnings,
      outputReadySeconds: (outputReady - start) / 1000,
      environment: { platform: process.platform, arch: process.arch, node: process.version },
      artifactIntegrity: 'pending',
    };
    saveJson(join(output, 'provenance.json'), provenance);
    if (adjudication) saveJson(join(output, 'adjudication.json'), adjudication);
    // Authenticity and semantic judgment remain distinct from byte integrity.
    try {
      verifyArtifacts(trial, artifactRoot);
      provenance.artifactIntegrity = 'verified';
      saveJson(join(output, 'provenance.json'), provenance);
    } catch (error) {
      trial.status = 'invalid-output';
      trial.review.limitations.push('Artifact integrity failed: ' + String(error));
      saveJson(join(output, 'trial.json'), trial);
    }
  }
  return Trial.parse(jsonFile(join(output, 'trial.json')));
}
export async function runSingle(
  suitePath: string,
  adapterPath: string,
  output: string,
  caseId: string,
  track: 'prepared' | 'end-to-end',
  profile: { id: string; maxUsd: number; maxSeconds: number },
) {
  const original = Suite.parse(jsonFile(suitePath)),
    config = AdapterConfig.parse(jsonFile(adapterPath));
  const suite = Suite.parse({ ...original, cases: original.cases.filter((c) => c.id === caseId) });
  verifySuiteArtifacts(suite, resolve(suitePath, '..'));
  const submission = await submissionFor(config);
  const plan = makePlan(suite, [submission], track, profile, 1, 0);
  const trial = await runSlot(
    plan,
    suite,
    plan.slots[0].id,
    join(resolve(suitePath, '..'), caseId, 'public'),
    config,
    output,
  );
  saveJson(join(output, 'suite.json'), suite);
  saveJson(join(output, 'plan.json'), plan);
  return trial;
}
