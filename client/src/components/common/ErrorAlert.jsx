import React from 'react';

/**
 * Standardized error alert banner.
 * Displays user-friendly error messages and surfaces correlated
 * Request IDs (X-Request-ID) for debugging/support without leaking stack traces.
 */
export const ErrorAlert = ({ error, onDismiss, onRetry }) => {
  if (!error) return null;

  const message = typeof error === 'string' ? error : error?.message || 'An unexpected error occurred.';
  const requestId = error?.requestId || null;
  const status = error?.status || null;

  return (
    <div className="error-alert-card" role="alert">
      <div className="error-alert-header">
        <span className="error-icon" aria-hidden="true">⚠️</span>
        <div className="error-alert-body">
          <p className="error-alert-message">{message}</p>
          {status && <span className="error-badge">Status: {status}</span>}
          {requestId && (
            <p className="error-request-id">
              Reference ID: <code>{requestId}</code>
            </p>
          )}
        </div>
      </div>
      <div className="error-alert-actions">
        {onRetry && (
          <button type="button" className="btn-retry" onClick={onRetry}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button type="button" className="btn-dismiss" onClick={onDismiss} aria-label="Dismiss error">
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorAlert;
