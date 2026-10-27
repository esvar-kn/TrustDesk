import { useState } from 'react';
import { getUser, logout } from './api.js';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';

export default function App() {
  const [user, setUser] = useState(getUser());

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <strong>TrustDesk</strong>
        <span className="spacer" />
        <span className="muted">
          {user.username} · <span className="role">{user.role}</span>
        </span>
        <button
          className="link"
          onClick={() => {
            logout();
            setUser(null);
          }}
        >
          Sign out
        </button>
      </header>
      <Workspace user={user} />

    </div>
  );
}
