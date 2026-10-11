import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-logo">
        Social Connect
      </NavLink>

      <div className="navbar-links">
        <NavLink to="/" end className="nav-link">Feed</NavLink>
        <NavLink to="/search" className="nav-link">Search</NavLink>
        <NavLink to="/messages" className="nav-link">Messages</NavLink>
        <NavLink to={`/profile/${user.username}`} className="nav-link">Profile</NavLink>
        <button className="btn btn-outline btn-sm" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
