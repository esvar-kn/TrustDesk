import { useState } from 'react';
import { getUser, logout } from './api.js';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';
import Approvals from './pages/Approvals.jsx';
import EvalView from './components/EvalView.jsx';
import Header from './components/shell/Header.jsx';
import SubContextBar from './components/shell/SubContextBar.jsx';
import Footer from './components/shell/Footer.jsx';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [view, setView] = useState('workspace');
  const [query, setQuery] = useState('');
  // Ticket to focus when navigating into the workspace from another view.
  const [focusTicketId, setFocusTicketId] = useState(null);

  if (!user) return <Login onLogin={setUser} />;

  function openTicket(ticketId) {
    setFocusTicketId(ticketId);
    setView('workspace');
  }

  return (
    <div className="flex flex-col h-screen bg-surface text-on-surface">
      <Header
        user={user}
        onLogout={() => {
          logout();
          setUser(null);
        }}
        view={view}
        onNavigate={setView}
        query={query}
        onQuery={setQuery}
      />
      <SubContextBar />
      <main className="flex-1 min-h-0 overflow-hidden">
        {view === 'workspace' && <Workspace user={user} query={query} focusTicketId={focusTicketId} />}
        {view === 'approvals' && <Approvals user={user} onOpenTicket={openTicket} />}
        {view === 'evaluations' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto px-margin py-space-lg">
              <EvalView />
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
