export interface MqttDropEvent {
  id: string;
  timestamp: string;
  deviceId: string;
  patientId: string;
  bedId: string;
  ward: string;
  expectedSeq: number;
  receivedSeq: number;
  droppedCount: number;
  aoiMs: number;
  qos: number;
  recordingSessionId?: string | null;
}

export interface DropRecordingSession {
  id: string;
  name: string;
  startedAt: string;
  stoppedAt: string | null;
  isActive: boolean;
  dropsCount: number;
  totalPacketsLost: number;
}

export interface MqttDropStats {
  totalDropsDetected: number;
  totalPacketsLost: number;
  activeDevicesCount: number;
  averageLossRatePercent: number;
  isRecording: boolean;
  activeSession: DropRecordingSession | null;
}
