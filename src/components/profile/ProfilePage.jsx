import React, { useState, useEffect, useCallback } from 'react';
import ProfileHeader from './ProfileHeader';
import ProfileTabs from './ProfileTabs';
import PostGrid from './PostGrid';
import PostModal from './PostModal';
import EditProfileModal from './EditProfileModal';
import MessageModal from './MessageModal';
import AlertBanner from '../AlertBanner';
import { 
  fetchProfile, 
  fetchUserPosts, 
  toggleFollowUser, 
  updateUserProfile, 
  sendDirectMessage 
} from '../../services/profileService';

export default function ProfilePage({ username = 'alexmorgan', onLogout }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [alert, setAlert] = useState(null);

  // Load profile details and user posts
  const loadProfileData = useCallback(async (targetUsername) => {
    setIsLoading(true);
    setAlert(null);
    try {
      const [profileRes, postsRes] = await Promise.all([
        fetchProfile(targetUsername),
        fetchUserPosts(targetUsername)
      ]);

      if (profileRes.success && profileRes.user) {
        setUser(profileRes.user);
        setIsFollowing(Boolean(profileRes.user.isFollowing));
        setFollowersCount(profileRes.user.stats?.followers || 0);
      } else {
        setAlert({ type: 'error', message: 'User profile not found.' });
      }

      if (postsRes.success) {
        setPosts(postsRes.posts || []);
      }
    } catch (_err) {
      setAlert({ type: 'error', message: 'Failed to load profile data from backend.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfileData(username);
  }, [username, loadProfileData]);

  // Handle Follow / Unfollow Action Button
  const handleFollowToggle = async () => {
    if (!user) return;
    setIsFollowLoading(true);
    try {
      const result = await toggleFollowUser(user.username);
      if (result.success) {
        setIsFollowing(result.isFollowing);
        setFollowersCount(result.followersCount);
        setAlert({
          type: 'success',
          message: result.message || (result.isFollowing ? `Now following @${user.username}` : `Unfollowed @${user.username}`)
        });
      }
    } catch (_err) {
      setAlert({ type: 'error', message: 'Unable to update follow state. Please try again.' });
    } finally {
      setIsFollowLoading(false);
    }
  };

  // Handle Edit Profile Save
  const handleSaveProfile = async (updatedData) => {
    const result = await updateUserProfile(updatedData);
    if (result.success) {
      setUser((prev) => ({ ...prev, ...updatedData }));
      setAlert({ type: 'success', message: 'Profile updated successfully!' });
    } else {
      throw new Error(result.message || 'Failed to save profile.');
    }
  };

  // Handle Message Send
  const handleSendMessage = async (recipientUsername, text) => {
    const result = await sendDirectMessage(recipientUsername, text);
    if (result.success) {
      setAlert({ type: 'success', message: `Message sent to @${recipientUsername}!` });
    } else {
      throw new Error(result.message || 'Failed to send message.');
    }
  };

  if (isLoading && !user) {
    return (
      <div className="profile-page-wrapper" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px' }}></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page-wrapper" id="profile-page">
      <main className="profile-main-container">
        {/* Status / Alert Banner */}
        <AlertBanner alert={alert} onClose={() => setAlert(null)} />

        {/* Profile Header (Avatar, Username, Stats, Bio, Action Buttons) */}
        <ProfileHeader 
          user={user}
          isFollowing={isFollowing}
          followersCount={followersCount}
          onFollowToggle={handleFollowToggle}
          onEditProfileClick={() => setIsEditModalOpen(true)}
          onMessageClick={() => setIsMessageModalOpen(true)}
          isFollowLoading={isFollowLoading}
          onLogout={onLogout}
        />

        {/* Instagram-style Tabs (POSTS, SAVED, TAGGED) */}
        <ProfileTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isOwnProfile={user?.isOwnProfile}
        />

        {/* Content Display: 3-column Grid or Saved/Tagged */}
        {activeTab === 'posts' && (
          <PostGrid 
            posts={posts}
            isOwnProfile={user?.isOwnProfile}
            onPostClick={(post) => setSelectedPost(post)}
            onFirstPostClick={() => {
              setAlert({
                type: 'success',
                message: 'Post creation modal opened! (Feature ready for next upload)'
              });
            }}
          />
        )}

        {activeTab === 'saved' && (
          <div className="empty-state">
            <div className="empty-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 className="empty-title">Saved Posts</h3>
            <p className="empty-desc">Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved.</p>
          </div>
        )}

        {activeTab === 'tagged' && (
          <div className="empty-state">
            <div className="empty-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <h3 className="empty-title">Photos of you</h3>
            <p className="empty-desc">When people tag you in photos, they will appear here.</p>
          </div>
        )}
      </main>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <EditProfileModal 
          user={user}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveProfile}
        />
      )}

      {/* Direct Message Modal */}
      {isMessageModalOpen && (
        <MessageModal 
          recipientUser={user}
          onClose={() => setIsMessageModalOpen(false)}
          onSend={handleSendMessage}
        />
      )}

      {/* Post Detail Lightbox Modal */}
      {selectedPost && (
        <PostModal 
          post={selectedPost}
          user={user}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
