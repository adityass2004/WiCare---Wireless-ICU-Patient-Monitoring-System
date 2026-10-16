import { z } from 'zod';
import { VitalQualitySchema, VitalTypeSchema } from './vitals.js';

export const MQTT_SCHEMA_VERSION = 1;

export const VitalSampleSchema = z.object({
  value: z.number(),
  unit: z.string().min(1),
  quality: VitalQualitySchema.default('ok'),
});
export type VitalSample = z.infer<typeof VitalSampleSchema>;

export const VitalsMessageSchema = z.object({
  schemaVersion: z.literal(MQTT_SCHEMA_VERSION),
  deviceId: z.string().min(1).max(64),
  patientId: z.string().min(1),
  bedId: z.string().min(1),
  ward: z.string().min(1),
  seq: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  vitals: z.record(VitalTypeSchema, VitalSampleSchema),
  qos: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type VitalsMessage = z.infer<typeof VitalsMessageSchema>;

export const DeviceStatusSchema = z.enum(['online', 'offline']);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const StatusMessageSchema = z.object({
  schemaVersion: z.literal(MQTT_SCHEMA_VERSION),
  deviceId: z.string().min(1).max(64),
  patientId: z.string().min(1),
  bedId: z.string().min(1),
  ward: z.string().min(1),
  status: DeviceStatusSchema,
  timestamp: z.string().datetime(),
});
export type StatusMessage = z.infer<typeof StatusMessageSchema>;

export function vitalsTopic(ward: string, bed: string, deviceId: string): string {
  return `wicare/${ward}/${bed}/${deviceId}/vitals`;
}

export function vitalsCriticalTopic(ward: string, bed: string, deviceId: string): string {
  return `wicare/${ward}/${bed}/${deviceId}/vitals/critical`;
}

export function statusTopic(ward: string, bed: string, deviceId: string): string {
  return `wicare/${ward}/${bed}/${deviceId}/status`;
}

export const ALERTS_TOPIC = 'wicare/alerts';
export const VITALS_TOPIC_FILTER = 'wicare/+/+/+/vitals';
export const VITALS_CRITICAL_TOPIC_FILTER = 'wicare/+/+/+/vitals/critical';
export const STATUS_TOPIC_FILTER = 'wicare/+/+/+/status';

export interface ParsedTopic {
  ward: string;
  bed: string;
  deviceId: string;
  kind: 'vitals' | 'vitals_critical' | 'status';
}

export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split('/');
  if (parts.length < 5 || parts[0] !== 'wicare') return null;
  const ward = parts[1];
  const bed = parts[2];
  const deviceId = parts[3];
  const kindPart = parts.slice(4).join('/');

  if (!ward || !bed || !deviceId) return null;

  let kind: 'vitals' | 'vitals_critical' | 'status';
  if (kindPart === 'vitals') {
    kind = 'vitals';
  } else if (kindPart === 'vitals/critical') {
    kind = 'vitals_critical';
  } else if (kindPart === 'status') {
    kind = 'status';
  } else {
    return null;
  }

  return { ward, bed, deviceId, kind };
}

