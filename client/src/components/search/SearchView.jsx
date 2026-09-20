import React, { useState, useEffect, useRef, useCallback } from 'react';
import userService from '../../services/userService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

export const SearchView = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [followStates, setFollowStates] = useState({});
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await userService.searchUsers({ q: q.trim(), limit: 20 });
      setResults(res?.data?.users || []);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  const handleFollowToggle = async (user) => {
    const isFollowing = followStates[user._id] ?? user.isFollowing;
    setFollowStates((prev) => ({ ...prev, [user._id]: !isFollowing }));
    try {
      if (isFollowing) {
        await userService.unfollowUser(user.username);
      } else {
        await userService.followUser(user.username);
      }
    } catch {
      setFollowStates((prev) => ({ ...prev, [user._id]: isFollowing }));
    }
  };

  return (
    <div className="search-view">
      <div className="search-header">
        <h1>Search People</h1>
        <div className="search-input-wrapper">
          <input
            id="search-input"
            type="search"
            className="form-input search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or name…"
            autoComplete="off"
            aria-label="Search users"
          />
          {isLoading && <LoadingSpinner size="small" />}
        </div>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      {!isLoading && query.trim() && results.length === 0 && (
        <div className="empty-state">
          <p>No users found for &ldquo;{query}&rdquo;.</p>
        </div>
      )}

      <ul className="search-results" aria-live="polite" aria-label="Search results">
        {results.map((user) => {
          const isFollowing = followStates[user._id] ?? user.isFollowing;
          return (
            <li key={user._id} className="search-result-item">
              <button
                type="button"
                className="search-result-user"
                onClick={() => onNavigate && onNavigate(`/profile/${user.username}`)}
              >
                {user.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={`${user.username} profile`}
                    className="avatar avatar-sm"
                    loading="lazy"
                  />
                ) : (
                  <div className="avatar avatar-sm avatar-placeholder" aria-hidden="true">
                    {(user.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="search-user-info">
                  <span className="search-username">{user.username}</span>
                  {user.fullName && <span className="search-fullname">{user.fullName}</span>}
                  {user.isPrivate && <span className="search-private">🔒 Private</span>}
                </div>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${isFollowing ? 'btn-outline' : 'btn-primary'}`}
                onClick={() => handleFollowToggle(user)}
                aria-label={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SearchView;
