import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { root, runtime } from '../runtime/config.ts';
import { digest } from '../plan.ts';
export const recipes = z
  .array(
    z.strictObject({
      id: z.string(),
      family: z.string(),
      kind: z.enum(['regression', 'clean']),
      mutation: z.enum(['hide-mobile-action', 'prevent-cancel', 'stale-total', 'copy']),
      expectedDefectIds: z.array(z.string()),
    }),
  )
  .parse(JSON.parse(readFileSync(join(root, 'evaluator/diagnostic-cases.json'), 'utf8')));
export type Recipe = (typeof recipes)[number];
export function taskSources(taskId: string) {
  const recipe = recipes.find((c) => c.id === taskId);
  if (!recipe) throw new Error(`Unknown diagnostic task ${taskId}`);
  const base = Object.fromEntries(
    ['app.html', 'style.css', 'app.js'].map((name) => [
      name,
      readFileSync(join(root, 'tasks/diagnostic', name), 'utf8'),
    ]),
  );
  const candidate = { ...base };
  if (recipe.mutation === 'hide-mobile-action')
    candidate['style.css'] += '\n@media (max-width: 600px) { #checkout { display: none; } }\n';
  if (recipe.mutation === 'prevent-cancel')
    candidate['app.js'] = candidate['app.js'].replace(
      "('cancel', () => {})",
      "('cancel', event => event.preventDefault())",
    );
  if (recipe.mutation === 'stale-total')
    candidate['app.js'] = candidate['app.js'].replace('Number(quantity.value) * 12', '12');
  if (recipe.mutation === 'copy')
    candidate['app.html'] = candidate['app.html'].replace('your next project.', 'your next idea.');
  return { base, candidate };
}
export function buildTask(taskId: string, destination: string) {
  const sources = taskSources(taskId);
  // Fail rather than overwrite an existing potentially collected run.
  mkdirSync(destination, { recursive: false });
  for (const revision of ['base', 'candidate'] as const) {
    mkdirSync(join(destination, revision));
    for (const [file, content] of Object.entries(sources[revision]))
      writeFileSync(join(destination, revision, file), content);
  }
  const task = {
    schemaVersion: 1,
    id: taskId,
    description: 'Review the proposed change to the Fieldwork Supply ordering page.',
    context:
      'Customers choose a quantity, inspect delivery information, and continue to checkout. Price is $12 per notebook. Review keyboard and responsive behavior as well as the displayed order state.',
    targets: runtime.targets,
    source: sources,
  };
  writeFileSync(join(destination, 'task.json'), JSON.stringify(task, null, 2) + '\n');
  writeFileSync(join(destination, 'instruction.md'), readFileSync(join(root, 'prompts/review.md')));
  return { task, taskDigest: digest(task) };
}
export function sourceBlob(content: unknown): string {
  const bytes = Buffer.from(JSON.stringify(content));
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
