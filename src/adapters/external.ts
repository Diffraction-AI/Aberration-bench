import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { Review, Trial } from '../contracts.ts';
import { jsonFile, saveJson } from '../runtime/files.ts';
import { nativeEnvironment, runProcess } from '../runtime/process.ts';
import type { AdapterConfigData } from './config.ts';

export const ExternalResult = z.strictObject({
  schemaVersion: z.literal(1),
  taskDigest: z.string().regex(/^[a-f0-9]{64}$/),
  track: z.enum(['prepared', 'end-to-end']),
  pipelineVersion: z.string().min(1),
  models: z.array(z.string()).min(1),
  status: Trial.shape.status,
  review: Review,
  charges: Trial.shape.charges,
  cancellationConfirmed: z.boolean(),
  limitations: z.array(z.string()),
});
export async function externalReview(
  config: AdapterConfigData,
  requestDocument: Record<string, unknown>,
  workspace: string,
  timeoutMs: number,
  signal: AbortSignal,
) {
  if (config.access !== 'external' || !config.executable)
    throw new Error('Diffraction command adapter needs an explicitly configured bridge executable');
  const requestPath = join(workspace, 'request.json'),
    outputPath = join(workspace, 'result.json');
  saveJson(requestPath, requestDocument);
  const extra: Record<string, string> = {};
  if (config.credentialEnv && process.env[config.credentialEnv])
    extra[config.credentialEnv] = process.env[config.credentialEnv]!;
  // The bridge accepts JSON files, never interpolated shell commands. It owns actual pipeline access/cancellation.
  const processResult = await runProcess(
    config.executable,
    [...(config.arguments ?? []), requestPath, outputPath],
    { cwd: workspace, env: nativeEnvironment(extra), timeoutMs, signal },
  );
  if (!existsSync(outputPath))
    throw new Error(
      processResult.timedOut
        ? 'Diffraction bridge timed out; cancellation is unconfirmed. Check the underlying run before retrying.'
        : 'Diffraction bridge did not produce a result',
    );
  const result = ExternalResult.parse(jsonFile(outputPath));
  if (result.taskDigest !== requestDocument.taskDigest || result.track !== requestDocument.track)
    throw new Error('Diffraction result does not match requested immutable input or track');
  if (
    result.pipelineVersion !== config.pipelineVersion ||
    JSON.stringify(result.models) !== JSON.stringify(config.models)
  )
    throw new Error('Diffraction pipeline/model identity differs from the frozen submission');
  if (processResult.timedOut || processResult.code !== 0)
    result.status = processResult.timedOut ? 'timeout' : 'error';
  if (result.status !== 'completed' && !result.cancellationConfirmed)
    result.limitations.push(
      'Underlying pipeline termination is unconfirmed; reconcile the run before retrying.',
    );
  return { result, processResult };
}
