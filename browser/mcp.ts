// This bridge has no evaluator, filesystem, arbitrary code or provider tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserSession } from '../src/runtime/browser.ts';
import { saveJson } from '../src/runtime/files.ts';
import { z } from 'zod';
const direct = process.argv[2] === '--task';
const session = direct
  ? new BrowserSession(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.argv[4])
  : null;
if (session) await session.start();
const settings = direct
  ? null
  : z
      .object({ url: z.url(), requestTimeoutMs: z.number().positive() })
      .parse(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const token = process.env.ABERRATION_BROWSER_TOKEN;
if (!direct && !token) throw new Error('Missing browser bridge credential');
async function close() {
  if (session) {
    await session.close();
    saveJson(join(session.artifactRoot, 'trajectory.json'), session.events);
  }
  process.exit(0);
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
const server = new McpServer({ name: 'aberration-browser', version: '0.1.0' });
const input = z.object({
  action: z.enum([
    'source',
    'navigate',
    'inspect',
    'click',
    'fill',
    'press',
    'scroll',
    'screenshot',
    'submit',
  ]),
  revision: z.enum(['base', 'candidate']).optional(),
  target: z.string().optional(),
  path: z.string().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  deltaY: z.number().optional(),
  review: z.record(z.string(), z.unknown()).optional(),
});
server.registerTool(
  'browser',
  {
    description:
      'Inspect source/task context or operate the base/candidate app in a requested browser target. Capture evidence with screenshot. Submit the final review through submit. Use CSS selectors for element actions.',
    inputSchema: input,
  },
  async (args) => {
    try {
      let value: Record<string, unknown>,
        ok = true;
      if (session) {
        value = await session.execute(args);
        saveJson(join(session.artifactRoot, 'trajectory.json'), session.events);
        if (session.review) saveJson(join(session.artifactRoot, 'review.json'), session.review);
      } else {
        const response = await fetch(settings!.url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(settings!.requestTimeoutMs),
        });
        value = (await response.json()) as Record<string, unknown>;
        ok = response.ok;
      }
      const { image, mimeType, ...text } = value;
      const content: (
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      )[] = [{ type: 'text', text: JSON.stringify(text) }];
      if (typeof image === 'string')
        content.push({ type: 'image', data: image, mimeType: String(mimeType) });
      return { content, isError: !ok };
    } catch (error) {
      return { content: [{ type: 'text', text: String(error) }], isError: true };
    }
  },
);
await server.connect(new StdioServerTransport());
