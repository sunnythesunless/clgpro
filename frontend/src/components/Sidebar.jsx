import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Upload,
  FileText,
  User,
  LogOut,
  Activity,
  BookOpen,
} from 'lucide-react';
import MedicalGlossaryModal from './MedicalGlossaryModal';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Generate Report' },
  { to: '/reports', icon: FileText, label: 'Report History' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showGlossary, setShowGlossary] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Activity size={28} />
          <span>MedReporter</span>
        </div>
        <p className="sidebar-subtitle">AI Radiology Reports</p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}

        {/* Global Medical Terminology Explainer */}
        <button
          type="button"
          className="sidebar-link"
          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: '0.5rem', color: '#38bdf8' }}
          onClick={() => setShowGlossary(true)}
          title="Open Plain-English Medical Terminology Explainer"
        >
          <BookOpen size={20} />
          <span>Medical Glossary</span>
        </button>
      </nav>

      {/* Global Glossary Modal */}
      <MedicalGlossaryModal isOpen={showGlossary} onClose={() => setShowGlossary(false)} />

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.name || 'User'}</span>
            <span className="sidebar-user-email">{user?.email || ''}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
