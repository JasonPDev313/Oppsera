'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListChecks,
  BookOpen,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { useAdminAuth } from '@/hooks/use-admin-auth';

const NAV = [
  { href: '/eval/feed', label: 'Eval Feed', icon: ListChecks },
  { href: '/eval/dashboard', label: 'Quality Dashboard', icon: LayoutDashboard },
  { href: '/eval/examples', label: 'Golden Examples', icon: BookOpen },
  { href: '/eval/patterns', label: 'Patterns', icon: AlertTriangle },
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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
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
