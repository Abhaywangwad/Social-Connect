import React, { useState, useRef } from 'react';
import postService from '../../services/postService.js';
import ErrorAlert from '../common/ErrorAlert.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';

export const CreatePostModal = ({ onClose, onCreated }) => {
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError({ message: 'Only JPEG, PNG, WebP, and GIF images are allowed.' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError({ message: 'Image must be smaller than 10 MB.' });
      return;
    }

    setMediaFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!mediaFile && !caption.trim()) {
      setError({ message: 'Please add an image or caption to your post.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (caption.trim()) formData.append('caption', caption.trim());
      if (location.trim()) formData.append('location', location.trim());
      if (mediaFile) formData.append('media', mediaFile);

      const res = await postService.createPost(formData);
      if (typeof onCreated === 'function') {
        onCreated(res?.data?.post);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create new post">
      <div className="modal-card modal-card--wide">
        <div className="modal-header">
          <h2>Create Post</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <ErrorAlert error={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit}>
          {/* Image Upload */}
          <div className="form-group">
            <div
              className={`image-upload-zone${preview ? ' image-upload-zone--filled' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Click to upload image"
            >
              {preview ? (
                <img src={preview} alt="Post preview" className="post-image-preview" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon" aria-hidden="true">📷</span>
                  <p>Click to add a photo</p>
                  <p className="upload-hint">JPEG, PNG, WebP or GIF · Max 10 MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="post-media-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="visually-hidden"
              aria-label="Upload post image"
            />
          </div>

          {preview && (
            <div className="form-group">
              <button
                type="button"
                className="link-button text-small"
                onClick={() => { setMediaFile(null); setPreview(null); }}
              >
                Remove image
              </button>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="post-caption">Caption</label>
            <textarea
              id="post-caption"
              className="form-input"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption…"
              maxLength={2200}
              disabled={isSubmitting}
            />
            <small className="form-hint">{caption.length}/2200</small>
          </div>

          <div className="form-group">
            <label htmlFor="post-location">Location (optional)</label>
            <input
              id="post-location"
              type="text"
              className="form-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location…"
              maxLength={100}
              disabled={isSubmitting}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              id="submit-post-btn"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? <LoadingSpinner message="Posting…" size="small" /> : 'Share Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePostModal;
