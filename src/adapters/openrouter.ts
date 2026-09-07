import { z } from 'zod';
import { BrowserAction } from '../runtime/browser.ts';
import type { BrowserSession } from '../runtime/browser.ts';
import type { AdapterConfigData } from './config.ts';
import { runtime } from '../runtime/config.ts';
import { saveArtifact } from '../runtime/files.ts';
import type { TrialData } from '../contracts.ts';

const knownMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
async function boundedJson(response: Response) {
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty OpenRouter response');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > runtime.maxResponseBytes) {
      await reader.cancel();
      throw new Error('OpenRouter response exceeds configured size');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function openrouterReview(
  config: AdapterConfigData,
  session: BrowserSession,
  prompt: string,
  budget: { maxUsd: number; maxSeconds: number },
  signal: AbortSignal,
  request: typeof fetch = fetch,
) {
  if (config.adapter !== 'openrouter' || config.access !== 'api' || !config.model)
    throw new Error('OpenRouter requires API access and an explicit model ID in configuration');
  const key = process.env[config.credentialEnv ?? 'OPENROUTER_API_KEY'];
  if (!key) throw new Error('Missing configured OpenRouter API credential');
  const base = runtime.openrouter.baseUrl;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  const requestSignal = () =>
    AbortSignal.any([signal, AbortSignal.timeout(runtime.requestTimeoutMs)]);
  const catalog = await boundedJson(
    await request(`${base}/models`, { headers, signal: requestSignal() }),
  );
  const model = catalog.data?.find((m: { id: string }) => m.id === config.model);
  if (
    !model ||
    !model.supported_parameters?.includes('tools') ||
    !model.architecture?.input_modalities?.includes('image')
  )
    throw new Error(
      'Selected model must currently support tool calling and image input; no model substitution was made',
    );
  saveArtifact(
    session.artifactRoot,
    'model-catalog.json',
    JSON.stringify({ retrievedAt: new Date().toISOString(), model }, null, 2),
    'receipt',
  );
  const messages: Record<string, unknown>[] = [{ role: 'user', content: prompt }];
  const schema = z.toJSONSchema(BrowserAction);
  const tools = [
    {
      type: 'function',
      function: {
        name: 'browser',
        description:
          'Read task source/context; operate live base and candidate browsers; capture screenshot evidence; submit final review.',
        parameters: schema,
      },
    },
  ];
  const charges: TrialData['charges'] = [],
    events: unknown[] = [];
  let status: TrialData['status'] = 'error',
    requests = 0;
  const reservation = config.maxRequestReservationUsd ?? runtime.maxRequestReservationUsd;
  while (requests < runtime.maxToolCalls && !signal.aborted) {
    const spent = charges.reduce((n, c) => n + (c.usd ?? 0), 0);
    if (charges.some((c) => c.usd === null)) {
      events.push({ event: 'stopped', reason: 'unreconciled-cost' });
      break;
    }
    if (spent + reservation > budget.maxUsd) {
      status = 'budget-exceeded';
      break;
    }
    if (
      JSON.stringify(messages, (key, value) => (key === 'image_url' ? '[image]' : value)).length >
      runtime.maxInputCharacters
    ) {
      events.push({ event: 'stopped', reason: 'input-limit' });
      break;
    }
    requests++;
    let response: Record<string, any>;
    try {
      response = await boundedJson(
        await request(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          signal: requestSignal(),
          body: JSON.stringify({
            model: config.model,
            messages,
            tools,
            tool_choice: 'auto',
            max_tokens: runtime.maxOutputTokens,
            provider: { ...runtime.openrouter.provider, require_parameters: true },
          }),
        }),
      );
    } catch (error) {
      charges.push({ component: 'model', basis: 'unknown', usd: null, receipt: null });
      events.push({
        event: 'request-error',
        message: error instanceof Error ? error.message : 'Request failed',
      });
      status = signal.aborted ? 'timeout' : 'error';
      break;
    }
    events.push({ event: 'completion', response });
    let receipt: Record<string, unknown> | null = null;
    if (typeof response.id === 'string') {
      for (
        let attempt = 0;
        attempt < runtime.openrouter.receiptAttempts && !signal.aborted;
        attempt++
      ) {
        try {
          const data = await boundedJson(
            await request(`${base}/generation?id=${encodeURIComponent(response.id)}`, {
              headers,
              signal: requestSignal(),
            }),
          );
          if (knownMoney(data.data?.total_cost)) {
            receipt = data.data;
            break;
          }
        } catch {
          /* One bounded reconciliation sequence, never an inference retry. */
        }
        if (attempt + 1 < runtime.openrouter.receiptAttempts)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(done, runtime.openrouter.receiptDelayMs);
            function done() {
              clearTimeout(timer);
              signal.removeEventListener('abort', done);
              resolve();
            }
            signal.addEventListener('abort', done, { once: true });
          });
      }
    }
    const usd = receipt && knownMoney(receipt.total_cost) ? receipt.total_cost : null;
    const artifact = saveArtifact(
      session.artifactRoot,
      `request-${requests}.json`,
      JSON.stringify(
        { responseId: response.id ?? null, usage: response.usage ?? null, receipt },
        null,
        2,
      ),
      'receipt',
    );
    charges.push({
      component: 'model',
      basis: usd === null ? 'unknown' : 'measured',
      usd,
      receipt: artifact,
    });
    if (charges.reduce((n, c) => n + (c.usd ?? 0), 0) > budget.maxUsd) {
      status = 'budget-exceeded';
      break;
    }
    const message = response.choices?.[0]?.message;
    if (!message) {
      status = 'invalid-output';
      break;
    }
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    });
    if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
      // Accept final JSON through the same evidence-reference gate as the MCP route.
      try {
        await session.execute({ action: 'submit', review: JSON.parse(message.content) });
        status = 'completed';
      } catch {
        status = 'invalid-output';
      }
      break;
    }
    const imageMessages: Record<string, unknown>[] = [];
    for (const call of message.tool_calls) {
      let result: Record<string, unknown>;
      try {
        if (call.function?.name !== 'browser') throw new Error('Unknown tool');
        result = await session.execute(JSON.parse(call.function.arguments));
      } catch (error) {
        result = { error: error instanceof Error ? error.message : 'Tool failed' };
      }
      const { image, mimeType, ...text } = result;
      events.push({ event: 'tool', call, result: text });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(text) });
      if (typeof image === 'string')
        imageMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: `Captured image for tool result ${call.id}` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}` } },
          ],
        });
    }
    messages.push(...imageMessages);
    if (session.review) {
      status = 'completed';
      break;
    }
  }
  if (signal.aborted) status = 'timeout';
  return {
    status,
    charges,
    events,
    requests,
    model: config.model,
    reservationPolicy:
      'Configured per-request reservation; delayed/unknown charges halt further requests; overruns remain visible.',
  };
}
