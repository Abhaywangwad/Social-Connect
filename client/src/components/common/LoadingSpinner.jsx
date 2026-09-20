import React from 'react';

export const LoadingSpinner = ({ message = 'Loading...', size = 'medium' }) => {
  return (
    <div className={`spinner-container spinner-${size}`} role="status" aria-live="polite">
      <div className="spinner-circle" />
      {message && <p className="spinner-text">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
