import React, { useState, useEffect } from 'react';
import { validateEmail, validatePassword } from '../utils/validation';
import { loginUser, getCurrentSession, AUTH_CONFIG } from '../services/authService';
import AlertBanner from './AlertBanner';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const session = getCurrentSession();
    if (session.isAuthenticated && session.user) {
      setAlert({
        type: 'success',
        message: `Currently signed in as ${session.user.name || session.user.email}.`
      });
    }
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleEmailBlur = () => {
    if (email.trim()) {
      const check = validateEmail(email);
      setErrors(prev => ({ ...prev, email: check.isValid ? '' : check.message }));
    }
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    if (errors.email) {
      const check = validateEmail(val);
      if (check.isValid) {
        setErrors(prev => ({ ...prev, email: '' }));
      }
    }
  };

  const handlePasswordBlur = () => {
    if (password) {
      const check = validatePassword(password);
      setErrors(prev => ({ ...prev, password: check.isValid ? '' : check.message }));
    }
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    if (errors.password && val.length >= 6) {
      setErrors(prev => ({ ...prev, password: '' }));
    }
  };

  const handleAutofillDemo = () => {
    setEmail(AUTH_CONFIG.demoUser.email);
    setPassword(AUTH_CONFIG.demoUser.password);
    setErrors({ email: '', password: '' });
    setAlert({
      type: 'success',
      message: 'Demo credentials loaded! Click "Sign In" to proceed.'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    // 1. Client-Side Validation
    const emailCheck = validateEmail(email);
    const passCheck = validatePassword(password);

    if (!emailCheck.isValid || !passCheck.isValid) {
      setErrors({
        email: emailCheck.isValid ? '' : emailCheck.message,
        password: passCheck.isValid ? '' : passCheck.message
      });
      triggerShake();
      return;
    }

    // 2. Loading State
    setIsLoading(true);

    try {
      // 3. Connect to Authentication Endpoint
      const result = await loginUser(email, password, rememberMe);

      if (result.success) {
        setIsLoading(false);
        setIsSuccess(true);
        setAlert({
          type: 'success',
          message: result.message || 'Login successful! Welcome back.'
        });
      } else {
        setIsLoading(false);
        setIsSuccess(false);
        setAlert({
          type: 'error',
          message: result.message || 'Incorrect email or password.'
        });
        triggerShake();
      }
    } catch (err) {
      setIsLoading(false);
      setAlert({
        type: 'error',
        message: 'An unexpected connection error occurred. Please try again.'
      });
      triggerShake();
    }
  };

  return (
    <div className="auth-container">
      {/* Alert Banner */}
      <AlertBanner alert={alert} onClose={() => setAlert(null)} />

      {/* Main Login Card */}
      <div className={`auth-card ${shake ? 'shake' : ''}`} id="auth-card">
        
        {/* Brand Header */}
        <header className="auth-header">
          <div className="brand-badge">
            <svg 
              className="brand-logo-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span className="brand-title">Social-Connect</span>
          </div>
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account to continue</p>
        </header>

        {/* Login Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          
          {/* Email Field */}
          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="email-input" className="form-label">Email Address</label>
            </div>
            <div className={`input-wrapper ${errors.email ? 'has-error' : ''}`}>
              <input 
                type="email" 
                id="email-input" 
                name="email" 
                className="form-input" 
                placeholder="you@socialconnect.com" 
                autoComplete="email" 
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                disabled={isLoading}
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'email-error' : undefined}
                required
              />
              <svg 
                className="input-icon" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            {errors.email && (
              <span id="email-error" className="field-error" aria-live="polite">
                {errors.email}
              </span>
            )}
          </div>

          {/* Password Field */}
          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="password-input" className="form-label">Password</label>
              <a href="#forgot" className="forgot-link">Forgot password?</a>
            </div>
            <div className={`input-wrapper ${errors.password ? 'has-error' : ''}`}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                id="password-input" 
                name="password" 
                className="form-input" 
                placeholder="••••••••" 
                autoComplete="current-password" 
                value={password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                disabled={isLoading}
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={errors.password ? 'password-error' : undefined}
                required
              />
              <svg 
                className="input-icon" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <button 
                type="button" 
                className="password-toggle-btn" 
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <span id="password-error" className="field-error" aria-live="polite">
                {errors.password}
              </span>
            )}
          </div>

          {/* Options: Remember Me */}
          <div className="form-options">
            <label className="checkbox-container">
              <input 
                type="checkbox" 
                id="remember-me" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
              />
              <span>Remember me</span>
            </label>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            id="submit-btn" 
            className={`submit-btn ${isLoading ? 'loading' : ''} ${isSuccess ? 'success' : ''}`}
            style={isSuccess ? { background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' } : {}}
            disabled={isLoading}
          >
            {isLoading && <div className="spinner" aria-hidden="true"></div>}
            {isSuccess && (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            )}
            <span id="btn-text">
              {isSuccess ? 'Authenticated!' : isLoading ? 'Signing in...' : 'Sign In'}
            </span>
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider" aria-hidden="true">
          <span>or continue with</span>
        </div>

        {/* Social Logins */}
        <div className="social-buttons-grid">
          <button type="button" className="social-btn" id="google-login-btn">
            <svg viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
              <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.8l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 17C3.7 20.7 7.5 23.5 12 23.5z"/>
            </svg>
            <span>Google</span>
          </button>
          <button type="button" className="social-btn" id="github-login-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span>GitHub</span>
          </button>
        </div>

        {/* Card Footer */}
        <footer className="auth-footer">
          <p>Don't have an account? <a href="#signup" className="signup-link">Create an account</a></p>
        </footer>
      </div>

      {/* Demo Credentials Chip */}
      <div className="demo-badge-container">
        <button 
          type="button" 
          className="demo-chip" 
          id="demo-credentials-chip" 
          onClick={handleAutofillDemo} 
          title="Click to autofill sample credentials"
        >
          <span>⚡ Autofill Demo:</span>
          <code>alex@socialconnect.com</code> / <code>Password123!</code>
        </button>
      </div>
    </div>
  );
}
