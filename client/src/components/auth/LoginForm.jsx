import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';

export const LoginForm = ({ onNavigateToRegister, onSuccess }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError({ message: 'Please enter both your email address and password.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: trimmedEmail, password });
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2 className="auth-title">Welcome to Social Connect</h2>
        <p className="auth-subtitle">Sign in to your account to connect and share</p>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="login-email">Email Address</label>
          <input
            id="login-email"
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isSubmitting}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={isSubmitting}
        >
          {isSubmitting ? <LoadingSpinner message="Signing in..." size="small" /> : 'Sign In'}
        </button>
      </form>

      <div className="auth-footer">
        <p>
          Don&apos;t have an account?{' '}
          <button
            type="button"
            className="link-button"
            onClick={onNavigateToRegister}
            disabled={isSubmitting}
          >
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
