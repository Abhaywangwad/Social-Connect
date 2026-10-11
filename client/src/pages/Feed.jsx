import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CreatePost from '../components/CreatePost.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  // Load a page of posts whenever `page` changes
  useEffect(() => {
    api(`/posts/feed?page=${page}&limit=10`)
      .then((data) => {
        // page 1 replaces the list, later pages are added to the end
        setPosts((prev) => (page === 1 ? data.posts : [...prev, ...data.posts]));
        setHasMore(data.hasMore);
      })
      .catch((err) => setError(err.message));
  }, [page]);

  const addPost = (post) => setPosts([post, ...posts]);
  const removePost = (id) => setPosts(posts.filter((p) => p._id !== id));

  return (
    <div className="stack">
      <CreatePost onCreated={addPost} />

      {error && <p className="error-text">{error}</p>}

      {posts.length === 0 && !error && (
        <p className="page-message">No posts yet. Search for people to follow!</p>
      )}

      {posts.map((post) => (
        <PostCard key={post._id} post={post} onDelete={removePost} />
      ))}

      {hasMore && (
        <button className="btn btn-outline" onClick={() => setPage(page + 1)}>
          Load more
        </button>
      )}
    </div>
  );
}
