import type { MqttDropEvent, DropRecordingSession, MqttDropStats } from '@wicare/shared';
import crypto from 'node:crypto';

export class MqttDropRecorder {
  private recentDrops: MqttDropEvent[] = [];
  private activeSession: DropRecordingSession | null = null;
  private recordedDrops = new Map<string, MqttDropEvent[]>();
  private totalDropsDetected = 0;
  private totalPacketsLost = 0;
  private maxHistory = 1000;

  /**
   * Records a packet drop gap event detected during MQTT ingestion.
   */
  recordDrop(drop: Omit<MqttDropEvent, 'id' | 'recordingSessionId'>): MqttDropEvent {
    this.totalDropsDetected++;
    this.totalPacketsLost += drop.droppedCount;

    const event: MqttDropEvent = {
      ...drop,
      id: `drop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      recordingSessionId: this.activeSession?.id ?? null,
    };

    // Store in recent memory buffer
    this.recentDrops.unshift(event);
    if (this.recentDrops.length > this.maxHistory) {
      this.recentDrops.pop();
    }

    // If an active user recording session is underway, save to session
    if (this.activeSession && this.activeSession.isActive) {
      this.activeSession.dropsCount++;
      this.activeSession.totalPacketsLost += drop.droppedCount;

      let sessionEvents = this.recordedDrops.get(this.activeSession.id);
      if (!sessionEvents) {
        sessionEvents = [];
        this.recordedDrops.set(this.activeSession.id, sessionEvents);
      }
      sessionEvents.unshift(event);
    }

    return event;
  }

  /**
   * Start a new drop recording session.
   */
  startRecording(name?: string): DropRecordingSession {
    if (this.activeSession && this.activeSession.isActive) {
      this.stopRecording();
    }

    const sessionId = `rec-${Date.now()}`;
    const sessionName = name && name.trim().length > 0 ? name.trim() : `Session #${Date.now().toString().slice(-4)}`;

    const session: DropRecordingSession = {
      id: sessionId,
      name: sessionName,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      isActive: true,
      dropsCount: 0,
      totalPacketsLost: 0,
    };

    this.activeSession = session;
    this.recordedDrops.set(sessionId, []);
    return session;
  }

  /**
   * Stop the active recording session.
   */
  stopRecording(): DropRecordingSession | null {
    if (!this.activeSession) return null;
    this.activeSession.isActive = false;
    this.activeSession.stoppedAt = new Date().toISOString();
    const stopped = { ...this.activeSession };
    return stopped;
  }

  /**
   * Get active or last session
   */
  getSession(): DropRecordingSession | null {
    return this.activeSession;
  }

  /**
   * Retrieve recent drops (default up to 100)
   */
  getRecentDrops(limit = 100): MqttDropEvent[] {
    return this.recentDrops.slice(0, limit);
  }

  /**
   * Retrieve drops for a given session or all recorded session drops
   */
  getRecordedDrops(sessionId?: string): MqttDropEvent[] {
    if (sessionId) {
      return this.recordedDrops.get(sessionId) || [];
    }
    if (this.activeSession) {
      return this.recordedDrops.get(this.activeSession.id) || [];
    }
    // Return all drops tagged with any session
    return this.recentDrops.filter((d) => d.recordingSessionId !== null);
  }

  /**
   * Get high-level summary statistics
   */
  getStats(activeDevicesCount = 0, averageLossRate = 0): MqttDropStats {
    return {
      totalDropsDetected: this.totalDropsDetected,
      totalPacketsLost: this.totalPacketsLost,
      activeDevicesCount,
      averageLossRatePercent: Number((averageLossRate * 100).toFixed(2)),
      isRecording: this.activeSession?.isActive ?? false,
      activeSession: this.activeSession,
    };
  }

  /**
   * Clear all stored drops
   */
  clear(): void {
    this.recentDrops = [];
    this.recordedDrops.clear();
    this.totalDropsDetected = 0;
    this.totalPacketsLost = 0;
    if (this.activeSession) {
      this.activeSession.dropsCount = 0;
      this.activeSession.totalPacketsLost = 0;
    }
  }
}
