import { spawn } from 'node:child_process';
export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  overflow: boolean;
}
export function nativeEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Deliberately omit ambient API keys, provider routers and integration credentials.
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'SYSTEMROOT',
    'COMSPEC',
    'CODEX_HOME',
  ])
    if (process.env[key]) result[key] = process.env[key];
  return { ...result, ...extra };
}
export function runProcess(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdin?: string;
    maxBytes?: number;
    signal?: AbortSignal;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '',
      stderr = '',
      bytes = 0,
      timedOut = false,
      overflow = false,
      killTimer: ReturnType<typeof setTimeout> | undefined;
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch {}
    };
    const stop = () => {
      signalGroup('SIGTERM');
      killTimer = setTimeout(() => signalGroup('SIGKILL'), 1000);
      killTimer.unref();
    };
    const aborted = () => {
      timedOut = true;
      stop();
    };
    const timer = setTimeout(aborted, options.timeoutMs);
    timer.unref();
    options.signal?.addEventListener('abort', aborted, { once: true });
    if (options.signal?.aborted) aborted();
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', aborted);
      signalGroup('SIGKILL');
    };
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= (options.maxBytes ?? 2_000_000)) stdout += chunk;
      else {
        overflow = true;
        stop();
      }
    });
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= (options.maxBytes ?? 2_000_000)) stderr += chunk;
      else {
        overflow = true;
        stop();
      }
    });
    child.on('close', (code) => {
      cleanup();
      resolve({ code, stdout, stderr, timedOut, overflow });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(options.stdin ?? '');
  });
}
