import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import type { VitalsMessage, DeviceStatus, MqttDropEvent, DropRecordingSession } from '@wicare/shared';
import type { Logger } from 'pino';
import { verifyToken } from '../auth.js';

export interface WsDeviceStatusEvent {
  deviceId: string;
  patientId?: string;
  ward?: string;
  bedId?: string;
  status: DeviceStatus;
  timestamp: string;
}

export interface WsDeviceStatsEvent {
  deviceId: string;
  measuredLossRate: number;
  totalReceived: number;
  gapCount: number;
  totalGaps: number;
}

export class WsServer {
  private io: SocketIOServer | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ws-server' });
  }

  attach(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (token && typeof token === 'string') {
        const user = verifyToken(token);
        if (user) {
          (socket as any).user = user;
        }
      }
      next();
    });

    this.io.on('connection', (socket) => {
      const user = (socket as any).user;
      this.logger.info({ socketId: socket.id, user: user?.email || 'anonymous' }, 'Web client connected via Socket.IO');

      socket.on('subscribe:ward', (ward: string) => {
        if (typeof ward === 'string' && ward.length > 0) {
          socket.join(`ward:${ward}`);
          this.logger.info({ socketId: socket.id, ward }, 'Client joined ward room');
        }
      });

      socket.on('unsubscribe:ward', (ward: string) => {
        if (typeof ward === 'string' && ward.length > 0) {
          socket.leave(`ward:${ward}`);
        }
      });

      socket.on('subscribe:all', () => {
        socket.join('all');
      });

      // Default join 'all' room
      socket.join('all');

      socket.on('disconnect', (reason) => {
        this.logger.info({ socketId: socket.id, reason }, 'Web client disconnected');
      });
    });
  }

  broadcastVitals(message: VitalsMessage): void {
    if (!this.io) return;
    this.io.to(`ward:${message.ward}`).to('all').emit('vitals:update', message);
  }

  broadcastStatus(event: WsDeviceStatusEvent): void {
    if (!this.io) return;
    if (event.ward) {
      this.io.to(`ward:${event.ward}`).to('all').emit('device:status', event);
    } else {
      this.io.to('all').emit('device:status', event);
    }
  }

  broadcastStats(event: WsDeviceStatsEvent): void {
    if (!this.io) return;
    this.io.to('all').emit('device:stats', event);
  }

  broadcastDrop(event: MqttDropEvent): void {
    if (!this.io) return;
    this.io.to('all').emit('network:drop', event);
  }

  broadcastRecorderStatus(session: DropRecordingSession | null): void {
    if (!this.io) return;
    this.io.to('all').emit('recorder:status', { active: !!(session && session.isActive), session });
  }

  emitAlertNew(alert: any, ward?: string): void {
    if (!this.io) return;
    if (ward) {
      this.io.to(`ward:${ward}`).to('all').emit('alert:new', alert);
    } else {
      this.io.to('all').emit('alert:new', alert);
    }
  }

  emitAlertUpdated(alert: any, ward?: string): void {
    if (!this.io) return;
    if (ward) {
      this.io.to(`ward:${ward}`).to('all').emit('alert:updated', alert);
    } else {
      this.io.to('all').emit('alert:updated', alert);
    }
  }

  emitAlertResolved(alert: any, ward?: string): void {
    if (!this.io) return;
    if (ward) {
      this.io.to(`ward:${ward}`).to('all').emit('alert:resolved', alert);
    } else {
      this.io.to('all').emit('alert:resolved', alert);
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.io) {
        this.io.close(() => resolve());
        this.io = null;
      } else {
        resolve();
      }
    });
  }
}

export type SocketServer = WsServer;

