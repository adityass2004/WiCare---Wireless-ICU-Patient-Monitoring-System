import { z } from 'zod';

export const VitalTypeSchema = z.enum([
  'heart_rate',
  'spo2',
  'temperature',
  'respiratory_rate',
  'ecg',
]);
export type VitalType = z.infer<typeof VitalTypeSchema>;

export const VitalQualitySchema = z.enum(['ok', 'noise', 'flatline', 'missing']);
export type VitalQuality = z.infer<typeof VitalQualitySchema>;

export const DeviceIdSchema = z.string().min(1).max(64);
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const VitalReadingSchema = z.object({
  deviceId: DeviceIdSchema,
  type: VitalTypeSchema,
  value: z.number(),
  unit: z.string().min(1),
  timestamp: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  quality: VitalQualitySchema.default('ok'),
});

export type VitalReading = z.infer<typeof VitalReadingSchema>;
