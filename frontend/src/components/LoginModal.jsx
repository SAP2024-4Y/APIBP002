import React, { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import ErrorNote from './ErrorNote.jsx';
import { DEMO_ACCOUNTS } from '../lib/catalog.js';
import { useEscape } from '../lib/hooks.js';

export default function LoginModal({ onClose, onSignedIn }) {
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'
  const [form, setForm] = useState({ username: 'demo', password: 'demo-password', email: '' });
  const [signupForm, setSignupForm] = useState({ username: '', password: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEscape(onClose);

  const signIn = async (username, password) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      onSignedIn({ token: res.token, role: res.role, username, expiresIn: res.expires_in });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.register(signupForm.username, signupForm.password, signupForm.email);
      onSignedIn({ token: res.token, role: res.role, username: signupForm.username, expiresIn: res.expires_in });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setS = (key) => (e) => setSignupForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button type="button" className="icon-btn modal-x" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <div className="modal-badge">
          <Icon name="key" size={20} />
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); setError(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`modal-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(null); }}
          >
            Sign Up
          </button>
        </div>

        {tab === 'signin' && (
          <>
            <h2 id="login-title">Sign in to ShopMesh</h2>
            <p className="muted">
              Exchanges credentials for a JWT via <code>POST /api/v1/auth/token</code>. The token stays in this tab&apos;s memory only.
            </p>

            <div className="quick-accounts">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.username} type="button" className="account" disabled={busy} onClick={() => signIn(a.username, a.password)}>
                  <span className={`role-badge ${a.role}`}>{a.label}</span>
                  <b>{a.username}</b>
                  <small>{a.blurb}</small>
                </button>
              ))}
            </div>

            <div className="divider"><span>or use credentials</span></div>

            <form onSubmit={(e) => { e.preventDefault(); signIn(form.username, form.password); }}>
              <label className="label">
                Username
                <input className="field" autoComplete="username" value={form.username} onChange={set('username')} required />
              </label>
              <label className="label">
                Password
                <input className="field" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required />
              </label>
              {error && <ErrorNote error={error} compact />}
              <button type="submit" className="btn primary block" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        )}

        {tab === 'signup' && (
          <>
            <h2 id="login-title">Create an account</h2>
            <p className="muted">
              Registers a new customer account via <code>POST /api/v1/auth/register</code>. You&apos;ll be signed in automatically.
            </p>

            <form onSubmit={signUp}>
              <label className="label">
                Username <span style={{ color: 'var(--accent-muted)', fontSize: '12px' }}>min 3 chars</span>
                <input
                  className="field"
                  autoComplete="username"
                  value={signupForm.username}
                  onChange={setS('username')}
                  minLength={3}
                  required
                  placeholder="e.g. john_doe"
                />
              </label>
              <label className="label">
                Email <span style={{ color: 'var(--accent-muted)', fontSize: '12px' }}>optional</span>
                <input
                  className="field"
                  type="email"
                  autoComplete="email"
                  value={signupForm.email}
                  onChange={setS('email')}
                  placeholder="you@example.com"
                />
              </label>
              <label className="label">
                Password <span style={{ color: 'var(--accent-muted)', fontSize: '12px' }}>min 6 chars</span>
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  value={signupForm.password}
                  onChange={setS('password')}
                  minLength={6}
                  required
                />
              </label>
              {error && <ErrorNote error={error} compact />}
              <button type="submit" className="btn primary block" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
