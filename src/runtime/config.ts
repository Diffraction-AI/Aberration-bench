import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const Target = z.strictObject({
  id: z.string(),
  browser: z.enum(['chromium', 'firefox', 'webkit']),
  viewport: z.strictObject({ width: z.int().positive(), height: z.int().positive() }),
});
export const runtime = z
  .strictObject({
    host: z.literal('127.0.0.1'),
    port: z.int().min(0).max(65535),
    actionTimeoutMs: z.int().positive(),
    requestTimeoutMs: z.int().positive(),
    maxResponseBytes: z.int().positive(),
    maxToolCalls: z.int().positive(),
    checkpointSeconds: z.int().positive(),
    maxOutputTokens: z.int().positive(),
    maxInputCharacters: z.int().positive(),
    maxArtifactBytes: z.int().positive(),
    maxRequestReservationUsd: z.number().positive(),
    targets: z.array(Target).min(1),
    openrouter: z.strictObject({
      baseUrl: z.url(),
      provider: z.record(z.string(), z.unknown()),
      receiptAttempts: z.int().positive(),
      receiptDelayMs: z.int().positive(),
    }),
    harbor: z.strictObject({
      version: z.string(),
      image: z.string(),
      cpu: z.int().positive(),
      memoryMb: z.int().positive(),
      timeoutSeconds: z.int().positive(),
    }),
  })
  .parse(JSON.parse(readFileSync(new URL('../../config/runtime.json', import.meta.url), 'utf8')));
export type TargetData = z.infer<typeof Target>;
