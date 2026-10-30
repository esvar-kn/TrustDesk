import { useState } from 'react';
import { getUser, logout } from './api.js';
import { useTheme } from './theme.js';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';
import Approvals from './pages/Approvals.jsx';
import EvalView from './components/EvalView.jsx';
import GuardrailDashboard from './components/GuardrailDashboard.jsx';
import AnalyticsView from './components/AnalyticsView.jsx';
import UsersAdmin from './components/UsersAdmin.jsx';
import Header from './components/shell/Header.jsx';
import Footer from './components/shell/Footer.jsx';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [view, setView] = useState('workspace');
  const [query, setQuery] = useState('');
  // Ticket to focus when navigating into the workspace from another view.
  const [focusTicketId, setFocusTicketId] = useState(null);
  const { dark, toggle } = useTheme();

  if (!user) return <Login onLogin={setUser} dark={dark} onToggleTheme={toggle} />;

  function openTicket(ticketId) {
    setFocusTicketId(ticketId);
    setView('workspace');
  }

  // Role-scoped views (Phase 8.10). Fall back to Workspace if the current role
  // can't see the selected view. Nav visibility mirrors this; security is enforced
  // server-side regardless.
  const VIEW_ROLES = {
    incidents: ['manager', 'auditor'],
    analytics: ['manager', 'auditor'],
    evaluations: ['manager', 'auditor'],
    users: ['manager'],
  };
  const canView = (v) => !VIEW_ROLES[v] || VIEW_ROLES[v].includes(user.role);
  const effectiveView = canView(view) ? view : 'workspace';

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
        dark={dark}
        onToggleTheme={toggle}
        onOpenTicket={openTicket}
      />
      <main className="flex-1 min-h-0 overflow-hidden">
        {effectiveView === 'workspace' && <Workspace user={user} query={query} focusTicketId={focusTicketId} />}
        {effectiveView === 'approvals' && <Approvals user={user} onOpenTicket={openTicket} />}
        {effectiveView === 'incidents' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto px-margin py-space-lg">
              <GuardrailDashboard onOpenTicket={openTicket} />
            </div>
          </div>
        )}
        {effectiveView === 'analytics' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto px-margin py-space-lg">
              <AnalyticsView />
            </div>
          </div>
        )}
        {effectiveView === 'users' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto px-margin py-space-lg">
              <UsersAdmin user={user} />
            </div>
          </div>
        )}
        {effectiveView === 'evaluations' && (
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
