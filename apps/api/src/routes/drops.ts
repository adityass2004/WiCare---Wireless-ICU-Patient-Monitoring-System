import type { FastifyInstance } from 'fastify';
import type { MqttDropRecorder } from '../mqtt/drop-recorder.js';
import type { DeviceRegistry } from '../mqtt/device-registry.js';
import type { WsServer } from '../ws/socket-server.js';

export interface DropRouteOptions {
  dropRecorder: MqttDropRecorder;
  registry: DeviceRegistry;
  wsServer?: WsServer;
}

export async function registerDropRoutes(
  app: FastifyInstance,
  options: DropRouteOptions,
): Promise<void> {
  const { dropRecorder, registry, wsServer } = options;

  // GET /api/network/drops - Overall drop statistics and recent drops
  app.get('/api/network/drops', async () => {
    const devices = registry.list();
    const activeCount = devices.filter((d) => d.online).length;

    let totalLoss = 0;
    let counted = 0;
    for (const dev of devices) {
      if (dev.firstSeq !== null && dev.lastSeq !== null) {
        totalLoss += registry.getMeasuredLossRate(dev.deviceId);
        counted++;
      }
    }
    const avgLoss = counted > 0 ? totalLoss / counted : 0;
    const stats = dropRecorder.getStats(activeCount, avgLoss);

    return {
      status: 'ok',
      stats,
      recentDrops: dropRecorder.getRecentDrops(100),
    };
  });

  // POST /api/network/recorder/start - Start drop recording session
  app.post<{
    Body: { name?: string };
  }>('/api/network/recorder/start', async (request) => {
    const name = request.body?.name;
    const session = dropRecorder.startRecording(name);
    if (wsServer) {
      wsServer.broadcastRecorderStatus(session);
    }
    return {
      success: true,
      session,
    };
  });

  // POST /api/network/recorder/stop - Stop current drop recording session
  app.post('/api/network/recorder/stop', async () => {
    const session = dropRecorder.stopRecording();
    if (wsServer) {
      wsServer.broadcastRecorderStatus(session);
    }
    return {
      success: true,
      session,
    };
  });

  // GET /api/network/recorder/events - List recorded drop events
  app.get<{
    Querystring: { sessionId?: string; deviceId?: string; bedId?: string };
  }>('/api/network/recorder/events', async (request) => {
    const { sessionId, deviceId, bedId } = request.query;
    let events = dropRecorder.getRecordedDrops(sessionId);

    if (deviceId) {
      events = events.filter((e) => e.deviceId === deviceId);
    }
    if (bedId) {
      events = events.filter((e) => e.bedId === bedId);
    }

    return {
      success: true,
      count: events.length,
      session: dropRecorder.getSession(),
      events,
    };
  });

  // DELETE /api/network/recorder/events - Clear drop records
  app.delete('/api/network/recorder/events', async () => {
    dropRecorder.clear();
    if (wsServer) {
      wsServer.broadcastRecorderStatus(dropRecorder.getSession());
    }
    return {
      success: true,
      message: 'Recorded MQTT drop events have been cleared.',
    };
  });
}
