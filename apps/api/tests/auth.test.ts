import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/auth.js';

describe('Auth & Security Subsystem', () => {
  it('correctly hashes and verifies passwords using crypto scrypt', () => {
    const rawPass = 'AdminPass123!';
    const hashed = hashPassword(rawPass);
    expect(hashed).toContain(':');
    expect(verifyPassword(rawPass, hashed)).toBe(true);
    expect(verifyPassword('WrongPass', hashed)).toBe(false);
  });

  it('signs and verifies JWT authentication tokens', () => {
    const payload = {
      id: 'usr-1',
      email: 'admin@wicare.local',
      name: 'Dr. Alice Admin',
      role: 'admin' as const,
    };

    const token = signToken(payload, 3600);
    expect(token.split('.').length).toBe(3);

    const verified = verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe('admin@wicare.local');
    expect(verified?.role).toBe('admin');
  });

  it('rejects tampered tokens', () => {
    const payload = {
      id: 'usr-2',
      email: 'clinician@wicare.local',
      name: 'Nurse Bob',
      role: 'clinician' as const,
    };

    const token = signToken(payload, 3600);
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.invalid_signature`;

    expect(verifyToken(tamperedToken)).toBeNull();
  });
});
