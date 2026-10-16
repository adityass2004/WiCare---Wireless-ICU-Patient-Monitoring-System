'use client';

import React, { useState } from 'react';
import { Shield, Key, AlertCircle } from 'lucide-react';
import { loginUser, type UserProfile } from '../lib/api';

interface LoginModalProps {
  onLoginSuccess: (user: UserProfile) => void;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onClose }) => {
  const [email, setEmail] = useState('admin@wicare.local');
  const [password, setPassword] = useState('AdminPass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuickFill = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginUser(email, password);
      onLoginSuccess(res.user);
      if (onClose) onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container" style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--accent-primary)', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <Shield size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>WiCare Security Authentication</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Sign in with your clinical credentials to access the system.
            </p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontSize: '0.85rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
              required
            />
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              DEMO QUICK ACCESSIBLE PROFILES:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                className="nav-tab"
                style={{ fontSize: '0.7rem', padding: '0.4rem', justifyContent: 'center' }}
                onClick={() => handleQuickFill('admin@wicare.local', 'AdminPass123!')}
              >
                Admin
              </button>
              <button
                type="button"
                className="nav-tab"
                style={{ fontSize: '0.7rem', padding: '0.4rem', justifyContent: 'center' }}
                onClick={() => handleQuickFill('clinician@wicare.local', 'ClinicianPass123!')}
              >
                Clinician
              </button>
              <button
                type="button"
                className="nav-tab"
                style={{ fontSize: '0.7rem', padding: '0.4rem', justifyContent: 'center' }}
                onClick={() => handleQuickFill('viewer@wicare.local', 'ViewerPass123!')}
              >
                Viewer
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
          >
            <Key size={16} />
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
