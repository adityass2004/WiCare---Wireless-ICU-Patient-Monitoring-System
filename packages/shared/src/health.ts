import { z } from 'zod';

export const HealthStatusSchema = z.enum(['online', 'offline', 'degraded']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
