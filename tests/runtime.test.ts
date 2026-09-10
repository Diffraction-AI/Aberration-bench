import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTask } from '../src/tasks/build.ts';
import { BrowserSession } from '../src/runtime/browser.ts';
import { startBridge } from '../src/runtime/bridge.ts';
import { runProcess, nativeEnvironment } from '../src/runtime/process.ts';
import { nativeInvocation, parseNativeResult } from '../src/adapters/native.ts';
import { openrouterReview } from '../src/adapters/openrouter.ts';
import { externalReview } from '../src/adapters/external.ts';
import { AdapterConfig } from '../src/adapters/config.ts';
import { pairedIntervals } from '../src/report.ts';
import { demo } from '../examples/demo.ts';
import { makePlan } from '../src/plan.ts';
import { runSlot, submissionFor } from '../src/runtime/run.ts';

const scratch = () => mkdtempSync(join(tmpdir(), 'aberration-test-'));
const native = {
  id: 'test',
  adapter: 'codex' as const,
  access: 'subscription' as const,
  model: null,
};
test('Public task bundles exclude labels, oracles, evaluator and git history', () => {
  const root = scratch();
  try {
    buildTask('a01', join(root, 'public'));
    const names = readdirSync(join(root, 'public'), { recursive: true });
    assert.deepEqual(
      names.sort(),
      [
        'base',
        'base/app.html',
        'base/app.js',
        'base/style.css',
        'candidate',
        'candidate/app.html',
        'candidate/app.js',
        'candidate/style.css',
        'instruction.md',
        'task.json',
      ].sort(),
    );
    const document = readFileSync(join(root, 'public/task.json'), 'utf8');
    assert.doesNotMatch(
      document,
      /expectedDefectIds|mobile-action-unavailable|oracleArtifacts|mutation/,
    );
    assert.throws(() => buildTask('a01', join(root, 'public')), /EEXIST/);
  } finally {
    rmSync(root, { recursive: true });
  }
});
test('Subscription child environments strip API billing credentials and provider overrides', () => {
  process.env.ABERRATION_TEST_PRIVATE_KEY = 'must-not-propagate';
  try {
    const env = nativeEnvironment({ ABERRATION_BROWSER_TOKEN: 'scoped' });
    assert.equal(env.ABERRATION_TEST_PRIVATE_KEY, undefined);
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.ABERRATION_BROWSER_TOKEN, 'scoped');
    assert.equal(env.HOME, process.env.HOME);
  } finally {
    delete process.env.ABERRATION_TEST_PRIVATE_KEY;
  }
});
test('Native invocations use the bounded MCP and retain subscription-compatible auth modes', () => {
  const invocation = nativeInvocation(
    native,
    '/workspace',
    'mcp.json',
    'schema.json',
    'report.json',
    'bridge.json',
  );
  assert.ok(invocation.args.includes('--ignore-user-config'));
  assert.ok(
    invocation.args.includes('mcp_servers.aberration.tools.browser.approval_mode="approve"'),
  );
  const claude = nativeInvocation(
    { ...native, adapter: 'claude' },
    '/workspace',
    'mcp.json',
    'schema.json',
    'report.json',
    'bridge.json',
  );
  assert.ok(!claude.args.includes('--bare'));
  assert.ok(claude.args.includes('--strict-mcp-config'));
  const parsed = parseNativeResult(
    'claude',
    JSON.stringify({
      type: 'result',
      usage: { input_tokens: 10 },
      total_cost_usd: 0.1,
      result: '{"findings":[],"limitations":[]}',
    }) + '\n',
  );
  assert.deepEqual(parsed.usage, { input_tokens: 10 });
  assert.equal(parsed.reportedCostUsd, 0.1);
  assert.deepEqual(parsed.review, { findings: [], limitations: [] });
});
test('Process deadlines and output ceilings terminate execution and preserve partial logs', async () => {
  const options = { cwd: tmpdir(), env: nativeEnvironment(), timeoutMs: 1000 };
  const timed = await runProcess(
    process.execPath,
    ['-e', 'process.stdout.write("started");setInterval(()=>{},1000)'],
    options,
  );
  assert.equal(timed.timedOut, true);
  assert.equal(timed.stdout, 'started');
  const overflow = await runProcess(
    process.execPath,
    ['-e', 'process.stdout.write("x".repeat(10000));setInterval(()=>{},1000)'],
    { ...options, timeoutMs: 2000, maxBytes: 20 },
  );
  assert.equal(overflow.overflow, true);
});
test('Browser bridge rejects invalid auth and forged evidence without launching a browser', async () => {
  const root = scratch(),
    { task } = buildTask('a01', join(root, 'public'));
  const session = new BrowserSession(task, join(root, 'artifacts')),
    bridge = await startBridge(session);
  try {
    const bad = await fetch(bridge.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + 'é'.repeat(64) },
      body: '{}',
    });
    assert.equal(bad.status, 403);
    const good = await fetch(bridge.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + bridge.token },
      body: '{"action":"source"}',
    });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).task.id, 'a01');
    const finding = demo().trials.find((t) => t.review.findings.length)!.review;
    await assert.rejects(session.execute({ action: 'submit', review: finding }), /not captured/);
  } finally {
    await bridge.close();
    await session.close();
    rmSync(root, { recursive: true });
  }
});

test('OpenRouter reconciles receipts, halts on unknown spend, and never retries inference', async () => {
  const root = scratch(),
    { task } = buildTask('a01', join(root, 'public'));
  process.env.ABERRATION_TEST_OPENROUTER_KEY = 'test-only';
  const config = {
    id: 'test-api',
    adapter: 'openrouter' as const,
    access: 'api' as const,
    model: 'example/vision',
    credentialEnv: 'ABERRATION_TEST_OPENROUTER_KEY',
    maxRequestReservationUsd: 0.1,
  };
  const catalog = {
    data: [
      {
        id: config.model,
        supported_parameters: ['tools'],
        architecture: { input_modalities: ['image'] },
      },
    ],
  };
  try {
    for (const mode of [
      'measured',
      'unknown',
      'overrun',
      'http-error',
      'no-tools',
      'wrong-model',
    ] as const) {
      const session = new BrowserSession(task, join(root, mode));
      let completions = 0;
      const request = (async (input, init) => {
        const url = String(input);
        if (url.endsWith('/models'))
          return Response.json(
            mode === 'no-tools'
              ? { data: [{ ...catalog.data[0], supported_parameters: [] }] }
              : mode === 'wrong-model'
                ? { data: [] }
                : catalog,
          );
        if (url.includes('/generation?'))
          return Response.json({
            data: { total_cost: mode === 'unknown' ? null : mode === 'overrun' ? 2 : 0.02 },
          });
        completions++;
        assert.equal(JSON.parse(String(init?.body)).model, config.model);
        assert.equal(JSON.parse(String(init?.body)).provider.data_collection, 'deny');
        if (mode === 'http-error') return new Response('unavailable', { status: 503 });
        const message =
          mode === 'unknown'
            ? {
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'browser', arguments: '{"action":"source"}' },
                  },
                ],
              }
            : { content: '{"findings":[],"limitations":[]}' };
        return Response.json({
          id: 'generation-test',
          usage: { prompt_tokens: 5 },
          choices: [{ message }],
        });
      }) as typeof fetch;
      try {
        if (mode === 'no-tools' || mode === 'wrong-model') {
          await assert.rejects(
            openrouterReview(
              config,
              session,
              'Review',
              { maxUsd: 1, maxSeconds: 30 },
              new AbortController().signal,
              request,
            ),
            /must currently support/,
          );
          assert.equal(completions, 0);
          continue;
        }
        const result = await openrouterReview(
          config,
          session,
          'Review',
          { maxUsd: 1, maxSeconds: 30 },
          new AbortController().signal,
          request,
        );
        assert.equal(completions, 1);
        assert.equal(
          result.status,
          mode === 'measured' ? 'completed' : mode === 'overrun' ? 'budget-exceeded' : 'error',
        );
        assert.equal(
          result.charges[0].usd,
          mode === 'unknown' || mode === 'http-error' ? null : mode === 'overrun' ? 2 : 0.02,
        );
        if (mode === 'measured') assert.ok(result.charges[0].receipt?.sha256);
      } finally {
        await session.close();
      }
    }
    const session = new BrowserSession(task, join(root, 'budget'));
    let calls = 0;
    const request = (async () => {
      calls++;
      return Response.json(catalog);
    }) as typeof fetch;
    const result = await openrouterReview(
      config,
      session,
      'Review',
      { maxUsd: 0.01, maxSeconds: 30 },
      new AbortController().signal,
      request,
    );
    assert.equal(result.status, 'budget-exceeded');
    assert.equal(calls, 1);
    await session.close();
  } finally {
    delete process.env.ABERRATION_TEST_OPENROUTER_KEY;
    rmSync(root, { recursive: true });
  }
});
test('External pipeline bridge rejects output for different immutable inputs', async () => {
  const root = scratch();
  try {
    const script = join(root, 'bridge.mjs');
    writeFileSync(
      script,
      `import {writeFileSync} from 'node:fs';writeFileSync(process.argv[3],JSON.stringify({schemaVersion:1,taskDigest:'b'.repeat(64),track:'prepared',pipelineVersion:'test',models:['test'],status:'completed',review:{findings:[],limitations:[]},charges:[],cancellationConfirmed:true,limitations:[]}));`,
    );
    await assert.rejects(
      externalReview(
        {
          id: 'bridge',
          adapter: 'diffraction-command',
          access: 'external',
          model: null,
          executable: process.execPath,
          arguments: [script],
        },
        { taskDigest: 'a'.repeat(64), track: 'prepared' },
        root,
        1000,
        new AbortController().signal,
      ),
      /does not match/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test('External submissions must freeze pipeline and model identity; auth modes cannot be mislabeled', () => {
  assert.throws(() => AdapterConfig.parse({ ...native, access: 'api' }), /disagree/);
  assert.throws(
    () => AdapterConfig.parse({ ...native, adapter: 'diffraction-command', access: 'external' }),
    /pipelineVersion/,
  );
});
test('Paired intervals keep project families together and withhold incomplete judgments', () => {
  const d = demo();
  d.suite.cases[1].family = 'second-family';
  const submissions = [d.plan.submissions[0], { ...d.plan.submissions[0], id: 'second' }];
  const plan = makePlan(d.suite, submissions, d.plan.track, d.plan.profile, 1, d.plan.seed);
  const trials = plan.slots.map((slot) => ({
    ...d.trials.find((t) => d.plan.slots.find((s) => s.id === t.slotId)!.caseId === slot.caseId)!,
    slotId: slot.id,
  }));
  const judgments = trials.map((t) => ({
    ...d.adjudications.find((a) => a.judgments.length === t.review.findings.length)!,
    slotId: t.slotId,
  }));
  const result = pairedIntervals(plan, d.suite, trials, judgments, submissions[0].id, 'second');
  assert.deepEqual(result.interval, [0, 0]);
  assert.equal(result.families, 2);
  assert.equal(
    pairedIntervals(plan, d.suite, trials, [], submissions[0].id, 'second').interval,
    null,
  );
});


test('External participants receive prepared source servers without duplicate broker recordings', async () => {
  const directory = scratch();
  const prepare = BrowserSession.prototype.prepare;
  BrowserSession.prototype.prepare = async () => { throw Error('External adapter must own its browser capture'); };
  try {
    const built = buildTask('a01', join(directory, 'public'));
    const script = join(directory, 'external.mjs');
    writeFileSync(script, `import fs from 'node:fs';
      const r=JSON.parse(fs.readFileSync(process.argv[2]));
      for(const origin of Object.values(r.origins)) {
        const response=await fetch(origin);
        if(!response.ok || !(await response.text()).includes('notebook')) throw Error('Prepared app unavailable');
      }
      fs.writeFileSync(process.argv[3],JSON.stringify({schemaVersion:1,taskDigest:r.taskDigest,track:r.track,
        pipelineVersion:'fixture',models:['fixture'],status:'completed',review:{findings:[],limitations:['Fixture only']},
        charges:[],cancellationConfirmed:true,limitations:[]}));`);
    const config = AdapterConfig.parse({id:'external-fixture', adapter:'diffraction-command', access:'external',
      model:'fixture', pipelineVersion:'fixture',models:['fixture'],executable:process.execPath,arguments:[script]});
    const suite = demo().suite;
    suite.cases = [{...suite.cases[0], id:'a01',taskDigest:built.taskDigest}];
    const plan = makePlan(suite, [await submissionFor(config)], 'prepared', {id:'fixture',maxUsd:0.5,maxSeconds:10},1,1);
    const result = await runSlot(plan,suite,plan.slots[0].id,join(directory,'public'),config,join(directory,'run'));
    assert.equal(result.status,'completed');
    assert.ok(result.elapsedSeconds < 10);
    assert.deepEqual(readdirSync(join(directory,'run','artifacts')).filter(n=>/\.(webm|zip)$/.test(n)),[]);
  } finally {
    BrowserSession.prototype.prepare = prepare;
    rmSync(directory,{recursive:true,force:true});
  }
});
