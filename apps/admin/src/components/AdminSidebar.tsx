'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListChecks,
  BookOpen,
  AlertTriangle,
  BrainCircuit,
  Building2,
  List,
  ChevronDown,
  ChevronRight,
  LogOut,
  Users,
  UserCog,
  Shield,
  Zap,
  Layers,
  FlaskConical,
  Beaker,
  DollarSign,
  ClipboardList,
  BarChart3,
  MessageSquare,
  ShieldAlert,
  Play,
} from 'lucide-react';
import { useAdminAuth } from '@/hooks/use-admin-auth';

interface NavModule {
  label: string;
  icon: typeof BrainCircuit;
  prefix: string;
  children: { href: string; label: string; icon: typeof ListChecks }[];
}

const MODULES: NavModule[] = [
  {
    label: 'Tenant Management',
    icon: Building2,
    prefix: '/tenants',
    children: [
      { href: '/tenants', label: 'All Tenants', icon: List },
    ],
  },
  {
    label: 'User Management',
    icon: Users,
    prefix: '/users',
    children: [
      { href: '/users/staff', label: 'Staff', icon: UserCog },
      { href: '/users/customers', label: 'Customers', icon: Users },
      { href: '/users/roles', label: 'Roles & Permissions', icon: Shield },
    ],
  },
  {
    label: 'Event System',
    icon: Zap,
    prefix: '/events',
    children: [
      { href: '/events', label: 'Failed Events', icon: AlertTriangle },
    ],
  },
  {
    label: 'Train OppsEra AI',
    icon: BrainCircuit,
    prefix: '/train-ai',
    children: [
      { href: '/train-ai/feed', label: 'Eval Feed', icon: ListChecks },
      { href: '/train-ai/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/train-ai/examples', label: 'Golden Examples', icon: BookOpen },
      { href: '/train-ai/playground', label: 'Playground', icon: Play },
      { href: '/train-ai/regression', label: 'Regression Tests', icon: FlaskConical },
      { href: '/train-ai/experiments', label: 'A/B Experiments', icon: Beaker },
      { href: '/train-ai/batch-review', label: 'Batch Review', icon: ClipboardList },
      { href: '/train-ai/comparative', label: 'Comparative', icon: BarChart3 },
      { href: '/train-ai/conversations', label: 'Conversations', icon: MessageSquare },
      { href: '/train-ai/cost', label: 'Cost Analytics', icon: DollarSign },
      { href: '/train-ai/safety', label: 'Safety Rules', icon: ShieldAlert },
      { href: '/train-ai/patterns', label: 'Patterns', icon: AlertTriangle },
      { href: '/train-ai/lenses', label: 'System Lenses', icon: Layers },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { session, logout } = useAdminAuth();

  return (
    <aside className="w-60 min-h-screen bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <span className="text-sm font-bold text-white">O</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">OppsEra</p>
          <p className="text-xs text-slate-400">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {MODULES.map((mod) => (
          <SidebarModule key={mod.prefix} module={mod} pathname={pathname} />
        ))}
      </nav>

      {/* User */}
      {session && (
        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-xs text-white font-medium truncate">{session.name}</p>
          <p className="text-xs text-slate-500 truncate">{session.email}</p>
          <p className="text-xs text-indigo-400 mt-0.5 capitalize">{session.role.replace('_', ' ')}</p>
          <button
            onClick={logout}
            className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}

function SidebarModule({ module: mod, pathname }: { module: NavModule; pathname: string }) {
  const isActive = pathname.startsWith(mod.prefix);
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'text-white bg-slate-800'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <mod.icon size={16} />
        <span className="flex-1 text-left">{mod.label}</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
          {mod.children.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
