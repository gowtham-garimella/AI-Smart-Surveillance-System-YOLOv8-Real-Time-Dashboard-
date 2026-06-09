"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();

  const handleTabChange = (loginState: boolean) => {
    setIsLogin(loginState);
    setError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'An error occurred during submission.');
      }

      if (isLogin) {
        setSuccessMessage('Access authorized! Redirecting to monitor console...');
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 1200);
      } else {
        setSuccessMessage('Security credentials registered! Switch to Sign In.');
        setUsername('');
        setPassword('');
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="auth-card glass animate-slide-up">
        <div className="auth-logo animate-float">🛡️ OMNI-SEC</div>
        <h2 className="auth-subtitle">AI Smart Surveillance & Threat Analyzer</h2>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => handleTabChange(true)}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => handleTabChange(false)}
          >
            Sign Up
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {successMessage && (
          <div
            className="auth-error"
            style={{
              backgroundColor: 'rgba(0, 255, 102, 0.12)',
              borderColor: 'rgba(0, 255, 102, 0.25)',
              color: '#a7f3d0',
            }}
          >
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Operator Username
            </label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="Enter operator ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Security Key
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Enter security key"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Authorizing...' : isLogin ? 'Access Console' : 'Register Operator'}
          </button>
        </form>
      </div>
    </div>
  );
}
