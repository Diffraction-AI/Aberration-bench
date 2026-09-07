import { z } from 'zod';
export const AdapterConfig = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    adapter: z.enum([
      'reference',
      'codex',
      'claude',
      'cursor',
      'openrouter',
      'diffraction-command',
    ]),
    access: z.enum(['diagnostic', 'subscription', 'api', 'external']),
    model: z.string().min(1).nullable(),
    executable: z.string().min(1).optional(),
    arguments: z.array(z.string()).optional(),
    credentialEnv: z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/)
      .optional(),
    maxRequestReservationUsd: z.number().positive().optional(),
    pipelineVersion: z.string().min(1).optional(),
    models: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const requiredAccess = {
      reference: 'diagnostic',
      codex: 'subscription',
      claude: 'subscription',
      cursor: 'subscription',
      openrouter: 'api',
      'diffraction-command': 'external',
    };
    if (value.access !== requiredAccess[value.adapter])
      ctx.addIssue({ code: 'custom', message: 'Adapter and access mode disagree' });
    if (
      value.adapter === 'diffraction-command' &&
      (!value.pipelineVersion || !value.models?.length)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'External pipelines require an immutable pipelineVersion and all model IDs',
      });
  });
export type AdapterConfigData = z.infer<typeof AdapterConfig>;
