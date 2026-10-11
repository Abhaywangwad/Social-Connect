import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ username: '', fullName: '', email: '', password: '' });
  const [error, setError] = useState('');

  // One change handler for all inputs, using each input's "name"
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    try {
      await signup(form);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Create account</h1>

        {error && <p className="error-text">{error}</p>}

        <input className="form-input" name="username" placeholder="Username"
          value={form.username} onChange={handleChange} required />
        <input className="form-input" name="fullName" placeholder="Full name (optional)"
          value={form.fullName} onChange={handleChange} />
        <input className="form-input" name="email" type="email" placeholder="Email"
          value={form.email} onChange={handleChange} required />
        <input className="form-input" name="password" type="password" placeholder="Password (min 6 characters)"
          value={form.password} onChange={handleChange} required />

        <button className="btn btn-primary" type="submit">
          Sign up
        </button>

        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
