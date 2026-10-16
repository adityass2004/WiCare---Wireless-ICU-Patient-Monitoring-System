import type { ExplainRequest, ExplainResponse, MqttDropEvent, DropRecordingSession, MqttDropStats } from '@wicare/shared';
import { ExplainResponseSchema } from '@wicare/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // When accessing from phone, tablet, or another machine on the local Wi-Fi,
    // automatically target the API on that same LAN IP:
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:4000`;
    }
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:4000';
}

export function getWsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return `http://${host}:4000`;
  }
  return 'http://localhost:4000';
}

let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return memoryToken;
  return localStorage.getItem('wicare_token');
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') {
    memoryToken = token;
    return;
  }
  if (token) {
    localStorage.setItem('wicare_token', token);
  } else {
    localStorage.removeItem('wicare_token');
  }
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'clinician' | 'viewer';
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }
  const data = await res.json();
  setAuthToken(data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface PatientSummary {
  id: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
  bedId: string;
  deviceId: string | null;
  status: 'online' | 'stale' | 'offline';
  lastSeen: string | null;
  lastSeq: number | null;
  totalReceived: number;
  measuredLossRate: number;
  aiRiskScore?: number | null;
  aiLabel?: string | null;
  aiExplanations?: string[];
  uhid?: string;
  bloodGroup?: string;
  primaryDiagnosis?: string;
  attendingDoctor?: string;
  admissionDate?: string;
  allergies?: string[];
  comorbidities?: string[];
  baselineLabs?: {
    bloodPressure?: string;
    bloodGlucose?: string;
    hemoglobin?: string;
    serumCreatinine?: string;
    arterialPh?: string;
    serumLactate?: string;
    sodium?: string;
    potassium?: string;
  };
  clinicalNotes?: string[];
}

export interface PatientReadingsResponse {
  patientId: string;
  count: number;
  readings: Array<{
    id: string;
    deviceId: string;
    patientId: string;
    seq: number;
    timestamp: string;
    vitals: Record<string, { value: number; unit: string; quality: string }>;
    qos: number;
  }>;
}

export interface SimulationConfig {
  count: number;
  speed: number;
  qos: 0 | 1;
  publishIntervalMs: number;
  lossRate: number;
  fixedDelayMs: number;
  jitterMs: number;
  brokerUrl: string;
}

export async function fetchPatients(all = true): Promise<{ count: number; patients: PatientSummary[] }> {
  const baseUrl = getApiBaseUrl();
  const url = all ? `${baseUrl}/patients?all=true` : `${baseUrl}/patients`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function fetchPatientReadings(patientId: string, limit = 50): Promise<PatientReadingsResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/patients/${patientId}/readings?limit=${limit}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch patient readings');
  return res.json();
}

export async function fetchSimulationStatus(): Promise<{ status: string; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/status`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch simulation status');
  return res.json();
}

export async function startSimulation(count = 5): Promise<{ success: boolean; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to start simulation');
  }
  return res.json();
}

export async function stopSimulation(): Promise<{ success: boolean; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to stop simulation');
  }
  return res.json();
}

export async function addSimBed(): Promise<{ success: boolean; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/add-bed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to add bed');
  }
  return res.json();
}

export async function removeSimBed(): Promise<{ success: boolean; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/remove-bed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to remove bed');
  }
  return res.json();
}

export async function updateSimulationConfig(newConfig: Partial<SimulationConfig>): Promise<{ success: boolean; config: SimulationConfig }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(newConfig),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update simulation config');
  }
  return res.json();
}

export async function updatePatientScenario(patientId: string, scenario: string): Promise<{ success: boolean }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/patients/${patientId}/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update patient scenario');
  }
  return res.json();
}

export async function updatePatientOverride(patientId: string, vital: string, value: number | null): Promise<{ success: boolean }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/patients/${patientId}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ vital, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update patient override');
  }
  return res.json();
}

export interface AlertItem {
  id: string;
  patientId: string;
  bedId: string;
  ward: string;
  deviceId: string;
  timestamp: string;
  measurement: string;
  value?: number | null;
  threshold?: string | null;
  severity: 'info' | 'warning' | 'critical';
  type: 'clinical' | 'malfunction' | 'stale' | 'ai';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  reason: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  lastSeenAt?: string;
  createdAt?: string;
}

export interface AlertThresholdItem {
  id: string;
  measurement: string;
  minWarning: number | null;
  maxWarning: number | null;
  minCritical: number | null;
  maxCritical: number | null;
  unit: string;
}

export async function fetchAlerts(status?: string): Promise<{ success: boolean; count: number; alerts: AlertItem[] }> {
  const baseUrl = getApiBaseUrl();
  const url = status ? `${baseUrl}/alerts?status=${status}` : `${baseUrl}/alerts`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export async function acknowledgeAlert(alertId: string, acknowledgedBy = 'Staff'): Promise<{ success: boolean; alert: AlertItem }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/alerts/${alertId}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ acknowledgedBy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to acknowledge alert');
  }
  return res.json();
}

export async function resolveAlert(alertId: string, resolvedBy = 'Staff'): Promise<{ success: boolean; alert: AlertItem }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ resolvedBy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to resolve alert');
  }
  return res.json();
}

export async function fetchThresholds(): Promise<{ success: boolean; thresholds: AlertThresholdItem[] }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/thresholds`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch thresholds');
  return res.json();
}

export async function updateThreshold(
  measurement: string,
  data: Partial<AlertThresholdItem>
): Promise<{ success: boolean; threshold: AlertThresholdItem }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/thresholds/${measurement}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update threshold');
  }
  return res.json();
}

export class ClinicalExplainerError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ClinicalExplainerError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function explainPatientDeterioration(
  patientId: string,
  options: ExplainRequest = {}
): Promise<ExplainResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/patients/${encodeURIComponent(patientId)}/explain`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };

  const body: ExplainRequest = {};
  if (options.alertId) body.alertId = options.alertId;
  if (typeof options.windowMinutes === 'number') body.windowMinutes = options.windowMinutes;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network request failed';
    throw new ClinicalExplainerError(
      `Unable to connect to clinical explainer service: ${errorMsg}`,
      0,
      'NETWORK_ERROR'
    );
  }

  if (!res.ok) {
    let errBody: { error?: string; message?: string; code?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      // Non-JSON response
    }

    const retryHeader = res.headers.get('Retry-After');
    const retryAfterSeconds = retryHeader ? parseInt(retryHeader, 10) : undefined;
    const message = errBody.message || errBody.error || `HTTP ${res.status}`;
    const code = errBody.code;

    throw new ClinicalExplainerError(message, res.status, code, retryAfterSeconds);
  }

  const rawJson = await res.json();
  const parseResult = ExplainResponseSchema.safeParse(rawJson);
  if (!parseResult.success) {
    throw new ClinicalExplainerError(
      'Explainer service returned an invalid response structure.',
      502,
      'SCHEMA_VALIDATION_ERROR'
    );
  }

  return parseResult.data;
}

export async function fetchDropOverview(): Promise<{
  status: string;
  stats: MqttDropStats;
  recentDrops: MqttDropEvent[];
}> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/network/drops`);
  if (!res.ok) {
    throw new Error('Failed to fetch drop overview');
  }
  return res.json();
}

export async function startDropRecording(name?: string): Promise<{
  success: boolean;
  session: DropRecordingSession;
}> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/network/recorder/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error('Failed to start recording session');
  }
  return res.json();
}

export async function stopDropRecording(): Promise<{
  success: boolean;
  session: DropRecordingSession | null;
}> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/network/recorder/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to stop recording session');
  }
  return res.json();
}

export async function fetchRecordedDrops(sessionId?: string, bedId?: string): Promise<{
  success: boolean;
  count: number;
  session: DropRecordingSession | null;
  events: MqttDropEvent[];
}> {
  const baseUrl = getApiBaseUrl();
  const params = new URLSearchParams();
  if (sessionId) params.append('sessionId', sessionId);
  if (bedId) params.append('bedId', bedId);
  const res = await fetch(`${baseUrl}/api/network/recorder/events?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch recorded drops');
  }
  return res.json();
}

export async function clearRecordedDrops(): Promise<{ success: boolean; message: string }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/network/recorder/events`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to clear drop events');
  }
  return res.json();
}

export async function setSimulatorNetworkLoss(lossRate: number): Promise<unknown> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/simulation/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lossRate }),
  });
  return res.json().catch(() => ({}));
}


