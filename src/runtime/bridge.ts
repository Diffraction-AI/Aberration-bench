import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { BrowserSession } from './browser.ts';
import { runtime } from './config.ts';
export async function startBridge(session: BrowserSession) {
  const token = randomBytes(32).toString('hex');
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/action') {
      res.writeHead(404);
      res.end();
      return;
    }
    const supplied = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body = '',
      bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > runtime.maxResponseBytes) {
        res.writeHead(413);
        res.end();
        req.destroy();
      } else body += chunk;
    });
    req.on('end', () => {
      queue = queue
        .then(async () => {
          try {
            const result = await session.execute(JSON.parse(body));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : 'Tool failed' }),
            );
          }
        })
        .catch(() => {});
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, runtime.host, resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No bridge port');
  return {
    url: `http://${runtime.host}:${addr.port}/action`,
    token,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await queue;
    },
  };
}
