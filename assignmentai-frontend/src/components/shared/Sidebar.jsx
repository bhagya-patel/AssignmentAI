import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Bot, Video,
  Users, BarChart3, Settings, LogOut, UserCircle,
  BookOpen, Inbox, ShieldCheck, Bell, X, FileText, Building2, Network, Library
} from 'lucide-react';

// ── Avatar chip ──────────────────────────────────────────────────────────────
function Avatar({ initials, size = 'md' }) {
  const s = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <span className={`${s} rounded-full bg-indigo-gradient text-white
                       font-bold flex items-center justify-center shrink-0`}>
      {initials}
    </span>
  );
}

// ── Nav configs per role ──────────────────────────────────────────────────────
const NAV = {
  student: [
    { label: 'Dashboard',      to: '/student',            icon: LayoutDashboard },
    { label: 'My Assignments', to: '/student/assignments', icon: ClipboardList   },
    { label: 'AI Grading',     to: '/student/ai-grading', icon: Bot             },
    { label: 'Live Viva',      to: '/student/viva',       icon: Video           },
    { label: 'Grades',         to: '/student/grades',     icon: BarChart3       },
    { label: 'Study Materials',to: '/student/materials',  icon: FileText        },
    { label: 'My Requests',    to: '/student/requests',   icon: Inbox           },
    { label: 'My Profile',     to: '/student/profile',    icon: UserCircle      },
  ],
  teacher: [
    { label: 'Overview',         to: '/teacher',              icon: LayoutDashboard },
    { label: 'Assignments',      to: '/teacher/assignments',  icon: ClipboardList   },
    { label: 'AI Grading Queue', to: '/teacher/grading',      icon: Bot             },
    { label: 'Live Viva',        to: '/teacher/viva',         icon: Video           },
    { label: 'Students',         to: '/teacher/students',     icon: Users           },
    { label: 'Student Requests', to: '/teacher/requests',     icon: Inbox           },
    { label: 'Study Materials',  to: '/teacher/materials',    icon: FileText        },
    { label: 'Analytics',        to: '/teacher/analytics',    icon: BarChart3       },
    { label: 'My Profile',       to: '/teacher/profile',      icon: UserCircle      },
  ],
  admin: [
    { label: 'System Overview', to: '/admin',              icon: LayoutDashboard },
    { label: 'Users & Roles',   to: '/admin/users',        icon: Users           },
    { label: 'Institutes',      to: '/admin/institutes',   icon: Building2       },
    { label: 'Departments',     to: '/admin/departments',  icon: Network         },
    { label: 'Subjects',        to: '/admin/subjects',     icon: Library         },
    { label: 'Courses',         to: '/admin/courses',      icon: BookOpen        },
    { label: 'AI Engine',       to: '/admin/ai-engine',    icon: Bot             },
    { label: 'Viva Control',    to: '/admin/viva',         icon: Video           },
    { label: 'Reports',         to: '/admin/reports',      icon: BarChart3       },
    { label: 'Security',        to: '/admin/security',     icon: ShieldCheck     },
    { label: 'Settings',        to: '/admin/settings',     icon: Settings        },
    { label: 'My Profile',      to: '/admin/profile',      icon: UserCircle      },
  ],
  ta: [
    { label: 'Dashboard',       to: '/ta',                 icon: LayoutDashboard },
    { label: 'My Sessions',     to: '/ta',                 icon: Video           },
    { label: 'My Profile',      to: '/ta/profile',         icon: UserCircle      },
  ],
};

const ROLE_LABEL = { student: 'Student', teacher: 'Professor', admin: 'System Administrator', ta: 'Teaching Assistant' };
const ROLE_COLOR = { student: 'text-ink-secondary', teacher: 'text-primary-700', admin: 'text-success', ta: 'text-warning-text' };

export default function Sidebar({ user }) {
  const navigate      = useNavigate();
  const location      = useLocation();
  const { logout }    = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const items = NAV[user.role] ?? [];

  // Listen for mobile menu toggle from TopBar hamburger
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('aaai:open-sidebar', handleOpen);
    return () => window.removeEventListener('aaai:open-sidebar', handleOpen);
  }, []);

  // Close sidebar on route change (for mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink-primary/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 md:w-60 bg-white border-r border-border
                    flex flex-col z-50 shadow-card transition-transform duration-300
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        aria-label="Main Navigation"
      >
        {/* Header / Logo */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="font-bold text-base text-ink-primary tracking-tight">
              Assignment<span className="text-primary">AI</span>
            </span>
          </div>
          {/* Mobile close button — 44×44 touch target */}
          <button
            className="md:hidden btn-icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links — scrollable, each item is min 44px tall */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 flex flex-col gap-0.5">
          {items.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={`${to}-${label}`}
              to={to}
              end={to === `/${user.role}` || to === '/admin'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              aria-current={({ isActive }) => isActive ? 'page' : undefined}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Notification quick-link */}
        <div className="px-3 pb-2">
          <button
            className="nav-item w-full flex items-center justify-between"
            onClick={() => window.dispatchEvent(new CustomEvent('aaai:toggle-notifications'))}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
              <span>Notifications</span>
            </div>
          </button>
        </div>

        {/* Divider */}
        <div className="divider mx-4" />

        {/* User profile */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Avatar initials={user.avatar} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-label-md text-ink-primary truncate">{user.name}</p>
            <p className={`text-label-sm truncate ${ROLE_COLOR[user.role]}`}>
              {ROLE_LABEL[user.role]}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="btn-icon shrink-0"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}
