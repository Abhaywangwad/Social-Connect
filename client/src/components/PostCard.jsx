import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function PostCard({ post, onDelete }) {
  const { user } = useAuth();
  const [likes, setLikes] = useState(post.likes);
  const [comments, setComments] = useState(post.comments);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');

  const liked = likes.includes(user._id);
  const isMine = post.author._id === user._id;

  const handleLike = async () => {
    try {
      const data = await api(`/posts/${post._id}/like`, { method: 'PUT' });
      setLikes(data.likes);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const data = await api(`/posts/${post._id}/comments`, {
        method: 'POST',
        body: { text: commentText },
      });
      setComments(data.comments);
      setCommentText('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await api(`/posts/${post._id}`, { method: 'DELETE' });
      onDelete(post._id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <article className="post-card">
      <header className="post-card-header">
        <Link to={`/profile/${post.author.username}`} className="post-author">
          <Avatar user={post.author} />
          <span className="post-author-name">{post.author.username}</span>
        </Link>
        {isMine && (
          <button className="btn btn-ghost btn-sm" onClick={handleDelete}>
            Delete
          </button>
        )}
      </header>

      {post.text && <p className="post-text">{post.text}</p>}
      {post.image && <img className="post-image" src={post.image} alt="Post" />}

      <div className="post-card-footer">
        <div className="post-actions">
          <button className={`btn btn-ghost btn-sm ${liked ? 'liked' : ''}`} onClick={handleLike}>
            {liked ? '♥' : '♡'} {likes.length}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowComments(!showComments)}>
            💬 {comments.length}
          </button>
        </div>
        <p className="post-date">{new Date(post.createdAt).toLocaleString()}</p>

        {error && <p className="error-text">{error}</p>}

        {showComments && (
          <div className="comment-section">
            {comments.map((c) => (
              <p key={c._id} className="comment-item">
                <Link to={`/profile/${c.user.username}`} className="comment-author">
                  {c.user.username}
                </Link>{' '}
                {c.text}
              </p>
            ))}
            <form className="comment-form" onSubmit={handleComment}>
              <input
                className="form-input"
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" type="submit">
                Post
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
