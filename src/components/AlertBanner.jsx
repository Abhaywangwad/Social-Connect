import React from 'react';

export default function AlertBanner({ alert, onClose }) {
  if (!alert || !alert.message) return null;

  return (
    <div 
      className={`alert-banner ${alert.type || 'error'}`} 
      role={alert.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <svg 
        className="alert-icon" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div className="alert-message">{alert.message}</div>
      <button 
        className="alert-close" 
        type="button" 
        onClick={onClose} 
        aria-label="Dismiss alert"
      >
        &times;
      </button>
    </div>
  );
}
