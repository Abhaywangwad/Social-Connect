import React from 'react';
import LoginForm from './components/LoginForm';
import './styles/auth.css';

export default function App() {
  return (
    <>
      {/* Ambient Animated Glow Lights */}
      <div className="background-glow" aria-hidden="true">
        <div className="glow-orb glow-orb-1"></div>
        <div className="glow-orb glow-orb-2"></div>
        <div className="glow-orb glow-orb-3"></div>
      </div>

      <main>
        <LoginForm />
      </main>
    </>
  );
}
