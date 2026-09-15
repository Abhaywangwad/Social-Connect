import React, { useState, useEffect } from 'react';

export default function EditProfileModal({ user, onClose, onSave }) {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full name cannot be empty.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onSave({
        fullName: fullName.trim(),
        bio: bio.trim(),
        website: website.trim()
      });
      onClose();
    } catch (_err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="modal-backdrop" 
      id="edit-profile-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog" 
      aria-modal="true"
      aria-labelledby="edit-profile-modal-title"
    >
      <div className="modal-content" id="edit-profile-modal">
        <div className="modal-header">
          <h3 className="modal-title" id="edit-profile-modal-title">Edit Profile</h3>
          <button 
            type="button" 
            className="modal-close-btn" 
            onClick={onClose}
            aria-label="Close edit profile modal"
          >
            &times;
          </button>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            {error}
          </div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-fullname" className="form-label">Full Name</label>
            <div className="input-wrapper">
              <input 
                type="text" 
                id="edit-fullname"
                className="form-input" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={50}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-bio" className="form-label">Bio</label>
            <textarea 
              id="edit-bio"
              className="modal-textarea" 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write something about yourself..."
              maxLength={200}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              {bio.length} / 200 characters
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="edit-website" className="form-label">Website</label>
            <div className="input-wrapper">
              <input 
                type="text" 
                id="edit-website"
                className="form-input" 
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
                maxLength={100}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-profile" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-profile btn-profile-primary"
              id="save-profile-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
