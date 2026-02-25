'use client';

import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, FileText, CreditCard, TrendingUp, Wallet, DollarSign } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Statements', href: '/statements', icon: FileText },
  { label: 'Account', href: '/account', icon: CreditCard },
  { label: 'Payment Methods', href: '/account/payment-methods', icon: Wallet },
  { label: 'Make a Payment', href: '/make-payment', icon: DollarSign },
  { label: 'Spending', href: '/spending', icon: TrendingUp },
];

export function PortalNav() {
  const pathname = usePathname();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  return (
    <nav className="border-b border-[var(--portal-border)] bg-[var(--portal-surface)]">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const fullHref = `/${tenantSlug}${item.href}`;
            const isActive = pathname === fullHref || pathname.startsWith(fullHref + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={fullHref}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-[var(--portal-primary)] text-[var(--portal-primary)]'
                    : 'border-transparent text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
