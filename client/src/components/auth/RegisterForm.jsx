import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';

export const RegisterForm = ({ onNavigateToLogin, onSuccess }) => {
  const { register, login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const { username, email, fullName, password, confirmPassword } = formData;

    if (!username.trim() || !email.trim() || !fullName.trim() || !password) {
      setError({ message: 'Please fill in all required fields.' });
      return;
    }

    if (password !== confirmPassword) {
      setError({ message: 'Passwords do not match.' });
      return;
    }

    if (password.length < 8) {
      setError({ message: 'Password must be at least 8 characters long.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        password,
      });

      setRegisteredSuccess(true);

      // Attempt automatic login after registration
      try {
        await login({ email: email.trim().toLowerCase(), password });
        if (typeof onSuccess === 'function') {
          onSuccess();
        }
      } catch {
        // If automatic login doesn't complete, direct to login
        if (typeof onNavigateToLogin === 'function') {
          onNavigateToLogin();
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registeredSuccess) {
    return (
      <div className="auth-card">
        <div className="auth-header">
          <h2 className="auth-title">Account Created!</h2>
          <p className="auth-subtitle">Redirecting you into Social Connect...</p>
        </div>
        <LoadingSpinner message="Entering application..." size="small" />
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2 className="auth-title">Create an Account</h2>
        <p className="auth-subtitle">Join Social Connect to explore and share</p>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="reg-fullname">Full Name</label>
          <input
            id="reg-fullname"
            name="fullName"
            type="text"
            className="form-input"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="John Doe"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-username">Username</label>
          <input
            id="reg-username"
            name="username"
            type="text"
            className="form-input"
            value={formData.username}
            onChange={handleChange}
            placeholder="johndoe"
            autoComplete="username"
            disabled={isSubmitting}
            required
          />
          <small className="form-hint">3-30 letters, numbers, underscores, periods</small>
        </div>

        <div className="form-group">
          <label htmlFor="reg-email">Email Address</label>
          <input
            id="reg-email"
            name="email"
            type="email"
            className="form-input"
            value={formData.email}
            onChange={handleChange}
            placeholder="john@example.com"
            autoComplete="email"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            name="password"
            type="password"
            className="form-input"
            value={formData.password}
            onChange={handleChange}
            placeholder="At least 8 characters (letters & numbers)"
            autoComplete="new-password"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-confirm-password">Confirm Password</label>
          <input
            id="reg-confirm-password"
            name="confirmPassword"
            type="password"
            className="form-input"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Re-enter password"
            autoComplete="new-password"
            disabled={isSubmitting}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={isSubmitting}
        >
          {isSubmitting ? <LoadingSpinner message="Creating account..." size="small" /> : 'Create Account'}
        </button>
      </form>

      <div className="auth-footer">
        <p>
          Already have an account?{' '}
          <button
            type="button"
            className="link-button"
            onClick={onNavigateToLogin}
            disabled={isSubmitting}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default RegisterForm;
