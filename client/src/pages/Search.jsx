import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

export default function Search() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);

  // Search as the user types. We wait 300ms after the last keystroke
  // before calling the API ("debouncing"), so we don't send a request per letter.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setUsers([]);
        return;
      }
      api(`/users/search?q=${encodeURIComponent(query)}`)
        .then((data) => setUsers(data.users))
        .catch(() => setUsers([]));
    }, 300);

    return () => clearTimeout(timer); // cancel if the user types again
  }, [query]);

  return (
    <div className="stack">
      <input
        className="form-input"
        placeholder="Search by username or name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {query && users.length === 0 && <p className="page-message">No users found.</p>}

      {users.map((u) => (
        <Link key={u._id} to={`/profile/${u.username}`} className="card user-row">
          <Avatar user={u} />
          <div>
            <p className="user-row-name">{u.username}</p>
            {u.fullName && <p className="muted">{u.fullName}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
