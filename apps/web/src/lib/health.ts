import { HealthResponseSchema, type HealthResponse } from '@wicare/shared';
import { getApiBaseUrl } from './api.js';

export async function fetchHealth(): Promise<HealthResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const data = await res.json();
  return HealthResponseSchema.parse(data);
}
