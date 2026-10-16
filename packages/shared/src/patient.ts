import { z } from 'zod';

export const PatientIdentitySchema = z.object({
  patientId: z.string().min(1),
  bedId: z.string().min(1),
  ward: z.string().min(1),
  deviceId: z.string().min(1),
});
export type PatientIdentity = z.infer<typeof PatientIdentitySchema>;

export const ScenarioTypeSchema = z.enum([
  'stable',
  'rising_hr',
  'falling_spo2',
  'deterioration',
  'sudden_change',
  'sensor_malfunction',
]);
export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;
