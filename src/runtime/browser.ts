import { createServer } from 'node:http';
import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { runtime, Target } from './config.ts';
import { Review } from '../contracts.ts';
import { saveArtifact } from './files.ts';

export const PublicTask = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  description: z.string(),
  context: z.string(),
  targets: z.array(Target).min(1),
  source: z.strictObject({
    base: z.record(z.string(), z.string()),
    candidate: z.record(z.string(), z.string()),
  }),
});
export const BrowserAction = z.strictObject({
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
  deltaY: z.number().finite().min(-5000).max(5000).optional(),
  review: Review.optional(),
});
export type BrowserActionData = z.infer<typeof BrowserAction>;
export class BrowserSession {
  task: z.infer<typeof PublicTask>;
  artifactRoot: string;
  origins: { base: string; candidate: string } = { base: '', candidate: '' };
  private servers: ReturnType<typeof createServer>[] = [];
  private browsers = new Map<string, Browser>();
  private contexts = new Map<string, { context: BrowserContext; page: Page }>();
  private sequence = 0;
  private closed = false;
  readonly events: unknown[] = [];
  readonly screenshots: ReturnType<typeof saveArtifact>[] = [];
  review: z.infer<typeof Review> | null = null;
  constructor(task: unknown, artifactRoot: string) {
    this.task = PublicTask.parse(task);
    this.artifactRoot = artifactRoot;
    mkdirSync(artifactRoot, { recursive: true });
  }
  async start() {
    for (const revision of ['base', 'candidate'] as const) {
      const files = this.task.source[revision];
      const server = createServer((req, res) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const name = path === '/' ? 'app.html' : path.slice(1);
        if (!Object.hasOwn(files, name)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.setHeader(
          'content-type',
          name.endsWith('.css')
            ? 'text/css'
            : name.endsWith('.js')
              ? 'text/javascript'
              : 'text/html',
        );
        res.setHeader('cache-control', 'no-store');
        res.end(files[name]);
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(runtime.port, runtime.host, resolve);
      });
      this.servers.push(server);
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No application port');
      this.origins[revision] = `http://${runtime.host}:${addr.port}`;
    }
  }
  async prepare(signal?: AbortSignal) {
    for (const revision of ['base', 'candidate'] as const)
      for (const target of this.task.targets) {
        signal?.throwIfAborted();
        await this.page(revision, target.id);
      }
  }
  private async page(revision: 'base' | 'candidate', targetId: string) {
    if (this.closed) throw new Error('Browser session closed');
    const target = this.task.targets.find((t) => t.id === targetId);
    if (!target) throw new Error('Unknown browser target');
    const id = revision + '-' + targetId;
    if (!this.contexts.has(id)) {
      let browser = this.browsers.get(target.browser);
      if (!browser) {
        browser = await { chromium, firefox, webkit }[target.browser].launch({ headless: true });
        this.browsers.set(target.browser, browser);
      }
      const context = await browser.newContext({
        viewport: target.viewport,
        serviceWorkers: 'block',
        recordVideo: { dir: join(this.artifactRoot, 'video'), size: target.viewport },
      });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.origin === this.origins[revision]
          ? route.continue()
          : route.abort('blockedbyclient');
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      const page = await context.newPage();
      page.setDefaultTimeout(runtime.actionTimeoutMs);
      page.on('console', (message) =>
        this.events.push({
          at: Date.now(),
          id,
          event: 'console',
          type: message.type(),
          text: message.text(),
        }),
      );
      page.on('pageerror', (error) =>
        this.events.push({ at: Date.now(), id, event: 'pageerror', message: error.message }),
      );
      this.contexts.set(id, { context, page });
      const response = await page.goto(this.origins[revision]);
      if (!response?.ok())
        throw new Error('Application failed its initial browser readiness check');
    }
    return this.contexts.get(id)!.page;
  }
  async execute(raw: unknown): Promise<Record<string, unknown>> {
    const input = BrowserAction.parse(raw);
    if (this.closed) throw new Error('Browser session closed');
    if (this.sequence >= runtime.maxToolCalls) throw new Error('Browser tool limit reached');
    this.sequence++;
    const at = Date.now();
    this.events.push({ at, event: 'action', input });
    if (input.action === 'source') return { task: this.task };
    if (input.action === 'submit') {
      const review = Review.parse(input.review);
      if (new Set(review.findings.map((f) => f.id)).size !== review.findings.length)
        throw new Error('Duplicate finding IDs');
      for (const f of review.findings)
        if (f.targets.some((t) => !this.task.targets.some((target) => target.id === t)))
          throw new Error('Finding refers to unknown browser target');
      for (const f of review.findings)
        for (const artifact of f.evidence)
          if (
            artifact.kind !== 'screenshot' ||
            !this.screenshots.some((s) => s.path === artifact.path && s.sha256 === artifact.sha256)
          )
            throw new Error('Finding references an artifact not captured in this session');
      this.review = review;
      return { accepted: true };
    }
    if (!input.revision || !input.target)
      throw new Error('revision and target are required for browser actions');
    const page = await this.page(input.revision, input.target);
    const selector = () => {
      if (!input.selector) throw new Error('selector required');
      return page.locator(input.selector);
    };
    switch (input.action) {
      case 'navigate': {
        const url = new URL(input.path ?? '/', this.origins[input.revision]);
        if (url.origin !== this.origins[input.revision])
          throw new Error('Navigation outside task origin is forbidden');
        await page.goto(url.toString());
        break;
      }
      case 'click':
        await selector().click();
        break;
      case 'fill':
        if (input.value === undefined) throw new Error('value required');
        await selector().fill(input.value);
        break;
      case 'press':
        if (!input.key) throw new Error('key required');
        await page.keyboard.press(input.key);
        break;
      case 'scroll':
        await page.mouse.wheel(0, input.deltaY ?? 0);
        break;
      case 'screenshot': {
        const bytes = await page.screenshot();
        if (bytes.length > runtime.maxArtifactBytes)
          throw new Error('Screenshot exceeds configured artifact size');
        const artifact = saveArtifact(
          this.artifactRoot,
          `capture-${String(this.sequence).padStart(4, '0')}.png`,
          bytes,
          'screenshot',
        );
        this.screenshots.push(artifact);
        return {
          artifact,
          revision: input.revision,
          target: input.target,
          image: bytes.toString('base64'),
          mimeType: 'image/png',
        };
      }
    }
    const observation: Record<string, unknown> = {
      revision: input.revision,
      target: input.target,
      url: page.url(),
      accessibility: await page.locator('body').ariaSnapshot(),
    };
    if (input.selector) {
      const locator = selector();
      observation.count = await locator.count();
      if (await locator.count()) {
        observation.visible = await locator.first().isVisible();
        observation.text = await locator.first().textContent();
        observation.bounds = await locator.first().boundingBox();
        observation.style = await locator.first().evaluate((el) => ({
          display: getComputedStyle(el).display,
          visibility: getComputedStyle(el).visibility,
          overflow: getComputedStyle(el).overflow,
          open: el.hasAttribute('open'),
        }));
      }
    }
    this.events.push({ at: Date.now(), event: 'observation', observation });
    return observation;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    const errors: string[] = [];
    for (const [id, { context }] of this.contexts) {
      try {
        await context.tracing.stop({ path: join(this.artifactRoot, `${id}.zip`) });
      } catch (e) {
        errors.push(String(e));
      }
      try {
        await context.close();
      } catch (e) {
        errors.push(String(e));
      }
    }
    for (const b of this.browsers.values()) await b.close().catch((e) => errors.push(String(e)));
    await Promise.all(
      this.servers.map(
        (s) =>
          new Promise<void>((resolve) => {
            s.close(() => resolve());
            s.closeAllConnections();
          }),
      ),
    );
    if (errors.length) this.events.push({ at: Date.now(), event: 'cleanup-errors', errors });
  }
}
