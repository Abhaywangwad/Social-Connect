import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import userService from '../../services/userService.js';
import postService from '../../services/postService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

const EditProfileModal = ({ user, onClose, onSaved }) => {
  const { updateCurrentUser } = useAuth();
  const [formData, setFormData] = useState({
    fullName: user.fullName || '',
    bio: user.bio || '',
    isPrivate: user.isPrivate || false,
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user.profilePicture || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError({ message: 'Profile picture must be smaller than 5 MB.' });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      // Profile picture upload uses multipart/form-data
      let profilePicture = user.profilePicture;
      if (avatarFile) {
        const fd = new FormData();
        fd.append('profilePicture', avatarFile);
        const res = await userService.updateProfile(fd);
        profilePicture = res?.data?.user?.profilePicture || profilePicture;
      }

      const res = await userService.updateProfile({
        fullName: formData.fullName.trim(),
        bio: formData.bio.trim(),
        isPrivate: formData.isPrivate,
      });

      const updatedUser = { ...res?.data?.user, profilePicture };
      updateCurrentUser(updatedUser);
      if (typeof onSaved === 'function') onSaved(updatedUser);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit profile">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ErrorAlert error={error} onDismiss={() => setError(null)} />
        <form onSubmit={handleSubmit}>
          <div className="form-group text-center">
            <div className="avatar-upload-wrapper">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile preview" className="avatar avatar-lg" />
              ) : (
                <div className="avatar avatar-lg avatar-placeholder">
                  {(user.username || '?')[0].toUpperCase()}
                </div>
              )}
              <label htmlFor="avatar-input" className="avatar-upload-label">
                Change Photo
              </label>
              <input
                id="avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="visually-hidden"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-fullname">Full Name</label>
            <input
              id="edit-fullname"
              type="text"
              className="form-input"
              value={formData.fullName}
              onChange={(e) => setFormData((p) => ({ ...p, fullName: e.target.value }))}
              maxLength={50}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-bio">Bio</label>
            <textarea
              id="edit-bio"
              className="form-input"
              rows={3}
              value={formData.bio}
              onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
              maxLength={300}
              disabled={isSubmitting}
              placeholder="Tell people about yourself…"
            />
            <small className="form-hint">{formData.bio.length}/300</small>
          </div>

          <div className="form-group form-group--inline">
            <label htmlFor="edit-private" className="form-label-inline">
              Private Account
            </label>
            <input
              id="edit-private"
              type="checkbox"
              checked={formData.isPrivate}
              onChange={(e) => setFormData((p) => ({ ...p, isPrivate: e.target.checked }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ProfileView = ({ username, currentUser, onNavigate }) => {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followStatus, setFollowStatus] = useState({ isFollowing: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [postsNextCursor, setPostsNextCursor] = useState(null);
  const [postsHasMore, setPostsHasMore] = useState(false);

  const targetUsername = username || authUser?.username;
  const isOwnProfile = authUser?.username === targetUsername;

  const loadProfile = useCallback(async () => {
    if (!targetUsername) return;
    setIsLoading(true);
    setError(null);
    try {
      const [profileRes, postsRes] = await Promise.all([
        userService.getUserProfile(targetUsername),
        userService.getUserPosts(targetUsername, { limit: 12 }),
      ]);

      setProfile(profileRes?.data?.user);
      setPosts(postsRes?.data?.posts || []);
      setPostsNextCursor(postsRes?.data?.nextCursor || null);
      setPostsHasMore(Boolean(postsRes?.data?.nextCursor));

      if (!isOwnProfile) {
        const fsRes = await userService.getFollowStatus(targetUsername);
        setFollowStatus(fsRes?.data || { isFollowing: false });
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [targetUsername, isOwnProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFollowToggle = async () => {
    if (isFollowLoading) return;
    setIsFollowLoading(true);
    try {
      if (followStatus.isFollowing) {
        await userService.unfollowUser(targetUsername);
        setFollowStatus({ isFollowing: false });
        setProfile((p) => ({ ...p, followersCount: (p.followersCount || 1) - 1 }));
      } else {
        await userService.followUser(targetUsername);
        setFollowStatus({ isFollowing: true });
        setProfile((p) => ({ ...p, followersCount: (p.followersCount || 0) + 1 }));
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsFollowLoading(false);
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading profile…" size="large" />;
  if (error) return <ErrorAlert error={error} onRetry={loadProfile} onDismiss={() => setError(null)} />;
  if (!profile) return <div className="empty-state"><p>User not found.</p></div>;

  const isPrivateAndNotFollowing = profile.isPrivate && !isOwnProfile && !followStatus.isFollowing;

  return (
    <div className="profile-view">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-section">
          {profile.profilePicture ? (
            <img
              src={profile.profilePicture}
              alt={`${profile.username} profile picture`}
              className="avatar avatar-xl"
            />
          ) : (
            <div className="avatar avatar-xl avatar-placeholder" aria-hidden="true">
              {(profile.username || '?')[0].toUpperCase()}
            </div>
          )}
        </div>

        <div className="profile-info">
          <div className="profile-top-row">
            <h1 className="profile-username">{profile.username}</h1>
            {isOwnProfile ? (
              <button
                id="edit-profile-btn"
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowEditModal(true)}
              >
                Edit Profile
              </button>
            ) : (
              <button
                id="follow-unfollow-btn"
                type="button"
                className={`btn btn-sm ${followStatus.isFollowing ? 'btn-outline' : 'btn-primary'}`}
                onClick={handleFollowToggle}
                disabled={isFollowLoading}
              >
                {isFollowLoading ? '…' : followStatus.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          <div className="profile-stats">
            <span className="profile-stat">
              <strong>{profile.postsCount || posts.length}</strong> posts
            </span>
            <span className="profile-stat">
              <strong>{profile.followersCount || 0}</strong> followers
            </span>
            <span className="profile-stat">
              <strong>{profile.followingCount || 0}</strong> following
            </span>
          </div>

          {profile.fullName && <p className="profile-fullname">{profile.fullName}</p>}
          {/* Bio is plain text — no dangerouslySetInnerHTML */}
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          {profile.isPrivate && <span className="profile-private-badge">🔒 Private</span>}
        </div>
      </div>

      {/* Posts Grid */}
      {isPrivateAndNotFollowing ? (
        <div className="profile-private-notice">
          <p>🔒 This account is private. Follow to see their posts.</p>
        </div>
      ) : (
        <div className="profile-posts-grid" aria-label="User posts">
          {posts.length === 0 ? (
            <div className="empty-state">
              <p>{isOwnProfile ? 'No posts yet. Create your first post!' : 'No posts yet.'}</p>
            </div>
          ) : (
            posts.map((post) => (
              <button
                key={post._id}
                type="button"
                className="profile-post-thumb"
                onClick={() => onNavigate && onNavigate(`/post/${post._id}`)}
                aria-label={`View post: ${post.caption?.slice(0, 40) || 'post'}`}
              >
                {post.media?.[0]?.url ? (
                  <img src={post.media[0].url} alt="Post thumbnail" loading="lazy" />
                ) : (
                  <div className="post-thumb-caption-only">
                    <span>{post.caption?.slice(0, 60) || '…'}</span>
                  </div>
                )}
                <div className="post-thumb-overlay">
                  <span>❤️ {post.likesCount || 0}</span>
                  <span>💬 {post.commentsCount || 0}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {postsHasMore && (
        <div className="profile-load-more">
          <button
            type="button"
            className="btn btn-outline"
            onClick={async () => {
              const res = await userService.getUserPosts(targetUsername, { cursor: postsNextCursor, limit: 12 });
              setPosts((prev) => [...prev, ...(res?.data?.posts || [])]);
              setPostsNextCursor(res?.data?.nextCursor || null);
              setPostsHasMore(Boolean(res?.data?.nextCursor));
            }}
          >
            Load more posts
          </button>
        </div>
      )}

      {showEditModal && (
        <EditProfileModal
          user={profile}
          onClose={() => setShowEditModal(false)}
          onSaved={(updatedUser) => setProfile((p) => ({ ...p, ...updatedUser }))}
        />
      )}
    </div>
  );
};

export default ProfileView;
