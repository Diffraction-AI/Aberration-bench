import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Review } from '../contracts.ts';
import { root, runtime } from '../runtime/config.ts';
import { saveJson } from '../runtime/files.ts';
import { nativeEnvironment, runProcess } from '../runtime/process.ts';
import type { AdapterConfigData } from './config.ts';

export function nativeInvocation(
  config: AdapterConfigData,
  workspace: string,
  mcpFile: string,
  schemaFile: string,
  reportFile: string,
  bridgeFile: string,
) {
  const mcpArgs = [join(root, 'browser/mcp.ts'), bridgeFile];
  const extraModel = config.model ? ['--model', config.model] : [];
  if (config.adapter === 'codex')
    return {
      executable: config.executable ?? 'codex',
      args: [
        'exec',
        '--json',
        '--ephemeral',
        '--ignore-user-config',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--output-schema',
        schemaFile,
        '--output-last-message',
        reportFile,
        ...extraModel,
        '-c',
        `mcp_servers.aberration.command=${JSON.stringify(process.execPath)}`,
        '-c',
        `mcp_servers.aberration.args=${JSON.stringify(mcpArgs)}`,
        '-c',
        'mcp_servers.aberration.env_vars=["ABERRATION_BROWSER_TOKEN"]',
        '-c',
        'mcp_servers.aberration.tools.browser.approval_mode="approve"',
        '-c',
        'web_search="disabled"',
        '-',
      ],
    };
  if (config.adapter === 'claude')
    return {
      executable: config.executable ?? 'claude',
      args: [
        '--print',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--mcp-config',
        mcpFile,
        '--permission-mode',
        'dontAsk',
        '--tools',
        '',
        '--allowedTools',
        'mcp__aberration__browser',
        ...extraModel,
      ],
    };
  if (config.adapter === 'cursor')
    return {
      executable: config.executable ?? 'agent',
      args: [
        '--print',
        '--output-format',
        'stream-json',
        '--workspace',
        workspace,
        '--approve-mcps',
        '--trust',
        '--sandbox',
        'enabled',
        ...extraModel,
      ],
    };
  throw new Error('Not a native subscription adapter');
}
export function parseNativeResult(adapter: string, stdout: string) {
  const events: Record<string, unknown>[] = [];
  for (const line of stdout.split('\n')) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* keep non-JSON text only in raw collector log */
    }
  }
  const result = events.findLast((e) => e.type === 'result');
  const completion = events.findLast((e) => e.type === 'turn.completed');
  const usage = result?.usage ?? completion?.usage ?? null;
  let review = null;
  if (typeof result?.result === 'string') {
    try {
      review = Review.parse(JSON.parse(result.result.replace(/^```json\s*|\s*```$/g, '')));
    } catch {}
  }
  return {
    events,
    usage,
    review,
    reportedCostUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
  };
}
export async function nativeReview(
  config: AdapterConfigData,
  workspace: string,
  prompt: string,
  bridge: { url: string; token: string },
  timeoutMs: number,
  signal?: AbortSignal,
) {
  if (config.access !== 'subscription')
    throw new Error('Native adapters currently require explicit subscription mode');
  const bridgeFile = join(workspace, 'browser.json');
  saveJson(bridgeFile, { url: bridge.url, requestTimeoutMs: runtime.requestTimeoutMs });
  const server = { command: process.execPath, args: [join(root, 'browser/mcp.ts'), bridgeFile] };
  const mcpFile = join(workspace, 'mcp.json');
  saveJson(mcpFile, { mcpServers: { aberration: server } });
  if (config.adapter === 'cursor') {
    mkdirSync(join(workspace, '.cursor'), { recursive: true });
    saveJson(join(workspace, '.cursor/mcp.json'), { mcpServers: { aberration: server } });
  }
  const schemaFile = join(workspace, 'review.schema.json');
  saveJson(schemaFile, z.toJSONSchema(Review));
  const reportFile = join(workspace, 'review.json');
  const env = nativeEnvironment({ ABERRATION_BROWSER_TOKEN: bridge.token });
  if (config.adapter === 'claude' && process.env.CLAUDE_CODE_OAUTH_TOKEN)
    env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const invocation = nativeInvocation(
    config,
    workspace,
    mcpFile,
    schemaFile,
    reportFile,
    bridgeFile,
  );
  // CLI auth status prevents an API-key-backed local login from silently becoming a subscription result.
  const authArgs =
    config.adapter === 'codex'
      ? ['login', 'status']
      : config.adapter === 'claude'
        ? ['auth', 'status']
        : ['status', '--format', 'json'];
  const auth = await runProcess(invocation.executable, authArgs, {
    cwd: workspace,
    env,
    timeoutMs: 10000,
  });
  const authText = auth.stdout + auth.stderr;
  let authenticated = false;
  if (config.adapter === 'codex') authenticated = /logged in using ChatGPT/i.test(authText);
  else {
    try {
      const value = JSON.parse(auth.stdout);
      authenticated =
        config.adapter === 'cursor'
          ? value.isAuthenticated === true
          : value.loggedIn === true && ['oauth', 'claude.ai'].includes(value.authMethod);
    } catch {}
  }
  if (config.adapter === 'claude' && env.CLAUDE_CODE_OAUTH_TOKEN) authenticated = true;
  if (!authenticated)
    throw new Error(
      `Subscription authentication unavailable for ${config.adapter}; use its native login command. No API fallback was attempted.`,
    );
  const version = await runProcess(invocation.executable, ['--version'], {
    cwd: workspace,
    env,
    timeoutMs: 10000,
  });
  const output = await runProcess(invocation.executable, invocation.args, {
    cwd: workspace,
    env,
    timeoutMs,
    stdin: prompt,
    maxBytes: runtime.maxResponseBytes,
    signal,
  });
  const parsed = parseNativeResult(config.adapter, output.stdout);
  if (config.adapter === 'codex' && existsSync(reportFile)) {
    try {
      parsed.review = Review.parse(JSON.parse(readFileSync(reportFile, 'utf8')));
    } catch {}
  }
  // Provider/CLI cost figures for subscription execution are usage estimates, not receipts.
  return {
    ...output,
    ...parsed,
    version: version.stdout.trim() || version.stderr.trim(),
    access: 'subscription' as const,
  };
}
