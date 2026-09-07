import { existsSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';
import { runProcess, nativeEnvironment } from './process.ts';
import { root } from './config.ts';
export async function doctor() {
  const commands = [
    ['codex', ['--version']],
    ['claude', ['--version']],
    ['agent', ['--version']],
    ['docker', ['version', '--format', '{{.Server.Version}}']],
  ] as const;
  const versions = await Promise.all(
    commands.map(async ([command, args]) => {
      try {
        const result = await runProcess(command, [...args], {
          cwd: root,
          env: nativeEnvironment(),
          timeoutMs: 10000,
        });
        return {
          command,
          available: result.code === 0,
          version: result.code === 0 ? result.stdout.trim() : null,
        };
      } catch {
        return { command, available: false, version: null };
      }
    }),
  );
  return {
    node: process.version,
    browsers: Object.fromEntries(
      Object.entries({ chromium, firefox, webkit }).map(([name, browser]) => [
        name,
        existsSync(browser.executablePath()),
      ]),
    ),
    versions,
    openrouterCredentialPresent: !!process.env.OPENROUTER_API_KEY,
    note: 'Read-only availability check; no inference or login. Native login status is checked again before each run. OpenRouter also requires an explicit vision/tool-capable model in configuration.',
  };
}
