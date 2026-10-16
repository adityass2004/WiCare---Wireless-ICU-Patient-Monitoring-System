import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface UserTokenPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'clinician' | 'viewer';
}

const JWT_SECRET = process.env.JWT_SECRET || 'wicare_super_secret_jwt_key_2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, combined: string): boolean {
  try {
    const [salt, originalHash] = combined.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    return false;
  }
}

export function signToken(payload: UserTokenPayload, expiresInSec = 86400): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const fullPayload = { ...payload, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token: string): UserTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    if (!headerB64 || !payloadB64 || !signature) return null;
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserTokenPayload;
  }
}

export async function authenticateRequest(request: FastifyRequest, reply: FastifyReply): Promise<UserTokenPayload | void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const user = verifyToken(token);
  if (!user) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired authentication token' });
    return;
  }

  request.user = user;
  return user;
}

export function requireRoles(roles: Array<'admin' | 'clinician' | 'viewer'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    if (!roles.includes(user.role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: `Role '${user.role}' is not authorized to access this resource. Required roles: ${roles.join(', ')}`,
      });
      return;
    }
  };
}
