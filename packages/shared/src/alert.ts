import { z } from 'zod';

export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertTypeSchema = z.enum(['clinical', 'malfunction', 'stale', 'ai']);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const AlertStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const AlertSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  bedId: z.string(),
  ward: z.string(),
  deviceId: z.string(),
  timestamp: z.string(),
  measurement: z.string(),
  value: z.number().nullable().optional(),
  threshold: z.string().nullable().optional(),
  severity: AlertSeveritySchema,
  type: AlertTypeSchema,
  status: AlertStatusSchema,
  reason: z.string(),
  acknowledgedBy: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  lastSeenAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AlertPayload = z.infer<typeof AlertSchema>;

export const AlertThresholdSchema = z.object({
  id: z.string(),
  measurement: z.string(),
  minWarning: z.number().nullable().optional(),
  maxWarning: z.number().nullable().optional(),
  minCritical: z.number().nullable().optional(),
  maxCritical: z.number().nullable().optional(),
  unit: z.string(),
});
export type AlertThresholdPayload = z.infer<typeof AlertThresholdSchema>;

export * from './explainer.js';
