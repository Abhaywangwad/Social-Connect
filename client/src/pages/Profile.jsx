import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Profile() {
  const { username } = useParams(); // from the URL: /profile/:username
  const { user: me, setUser: setMe } = useAuth();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);

  // Load the profile whenever the username in the URL changes
  useEffect(() => {
    api(`/users/${username}`)
      .then((data) => {
        setError('');
        setProfile(data.user);
        setPosts(data.posts);
      })
      .catch((err) => setError(err.message));
  }, [username]);

  if (!profile) return <p className="page-message">{error || 'Loading...'}</p>;

  const isMe = profile._id === me._id;
  const isFollowing = profile.followers.includes(me._id);

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await api(`/users/${profile._id}/follow`, { method: 'DELETE' });
        setProfile({ ...profile, followers: profile.followers.filter((id) => id !== me._id) });
      } else {
        await api(`/users/${profile._id}/follow`, { method: 'POST' });
        setProfile({ ...profile, followers: [...profile.followers, me._id] });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const startEditing = () => {
    setFullName(profile.fullName);
    setBio(profile.bio);
    setAvatarFile(null);
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('bio', bio);
    if (avatarFile) formData.append('avatar', avatarFile);

    try {
      const data = await api('/users/me', { method: 'PUT', body: formData });
      setProfile(data.user);
      setMe(data.user); // keep the logged-in user in sync
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <section className="card profile-header">
        <Avatar user={profile} size="xl" />

        <div className="profile-info">
          <div className="profile-top-row">
            <h2>{profile.username}</h2>
            {isMe ? (
              <button className="btn btn-outline btn-sm" onClick={startEditing}>
                Edit profile
              </button>
            ) : (
              <>
                <button
                  className={`btn btn-sm ${isFollowing ? 'btn-outline' : 'btn-primary'}`}
                  onClick={handleFollow}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
                <Link className="btn btn-outline btn-sm" to={`/messages/${profile.username}`}>
                  Message
                </Link>
              </>
            )}
          </div>

          <div className="profile-stats">
            <span><strong>{posts.length}</strong> posts</span>
            <span><strong>{profile.followers.length}</strong> followers</span>
            <span><strong>{profile.following.length}</strong> following</span>
          </div>

          {profile.fullName && <p className="profile-fullname">{profile.fullName}</p>}
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {editing && (
        <form className="card stack" onSubmit={handleSave}>
          <h3>Edit profile</h3>
          <label>
            Full name
            <input className="form-input" value={fullName} maxLength={50}
              onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            Bio
            <textarea className="form-input" rows="3" value={bio} maxLength={150}
              onChange={(e) => setBio(e.target.value)} />
          </label>
          <label>
            Profile photo
            <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files[0] || null)} />
          </label>
          <div className="row">
            <button className="btn btn-primary" type="submit">Save</button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {posts.length === 0 && <p className="page-message">No posts yet.</p>}
      {posts.map((post) => (
        <PostCard
          key={post._id}
          post={post}
          onDelete={(id) => setPosts(posts.filter((p) => p._id !== id))}
        />
      ))}
    </div>
  );
}
