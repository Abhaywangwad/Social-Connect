import React, { useState, useEffect } from 'react';

export default function MessageModal({ recipientUser, onClose, onSend }) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSending(true);
    try {
      await onSend(recipientUser.username, text.trim());
      setFeedback({ type: 'success', message: `Direct message sent to @${recipientUser.username}!` });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (_err) {
      setFeedback({ type: 'error', message: 'Failed to send message. Please try again.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div 
      className="modal-backdrop" 
      id="message-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-modal-title"
    >
      <div className="modal-content" id="message-modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img 
              src={recipientUser?.avatarUrl} 
              alt={recipientUser?.username} 
              style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <h3 className="modal-title" id="message-modal-title">
              Message @{recipientUser?.username}
            </h3>
          </div>
          <button 
            type="button" 
            className="modal-close-btn" 
            onClick={onClose}
            aria-label="Close message modal"
          >
            &times;
          </button>
        </div>

        {feedback && (
          <div 
            style={{ 
              padding: '0.6rem 0.8rem', 
              borderRadius: '8px', 
              fontSize: '0.85rem',
              marginBottom: '1rem',
              background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5'
            }}
          >
            {feedback.message}
          </div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="message-text" className="form-label">Your message</label>
            <textarea 
              id="message-text"
              className="modal-textarea" 
              placeholder={`Write a friendly message to ${recipientUser?.fullName}...`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSending}
              required
              rows={4}
            />
          </div>

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-profile" 
              onClick={onClose}
              disabled={isSending}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-profile btn-profile-primary"
              id="send-message-btn"
              disabled={isSending || !text.trim()}
            >
              {isSending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
