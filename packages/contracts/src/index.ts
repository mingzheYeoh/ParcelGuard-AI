/**
 * @parcelguard/contracts — shared Zod schemas and TypeScript types.
 *
 * Task 1 (scaffold) only establishes the package boundary and the API base path.
 * The full contract surface (PLAN.md §6.2 objects, §7 endpoints, fixtures,
 * apiPaths map) is implemented in Task 2 and frozen afterwards.
 */
import { z } from 'zod';

export const API_BASE_PATH = '/api/v1';

/** IntegrationMode — PLAN.md §7.1. */
export const integrationModeSchema = z.enum(['mock', 'live', 'unavailable']);
export type IntegrationMode = z.infer<typeof integrationModeSchema>;

/** GET /api/v1/health success payload — PLAN.md §7.1 (placeholder route in Task 1). */
export const healthResponseSchema = z.object({
  api: z.literal('ok'),
  model: integrationModeSchema,
  terminal3: integrationModeSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Success envelope — PLAN.md §7. */
export const successEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, request_id: z.string() });

/** Error envelope — PLAN.md §7. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
  request_id: z.string(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
