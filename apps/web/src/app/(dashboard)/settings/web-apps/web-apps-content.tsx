'use client';

import { useState } from 'react';
import { Copy, ExternalLink, Check, Users, CalendarDays, ShoppingBag, Shield, QrCode } from 'lucide-react';
import type { Globe } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';

interface WebApp {
  id: string;
  name: string;
  description: string;
  icon: typeof Globe;
  status: 'active' | 'coming_soon' | 'not_configured';
  portalUrl?: string;
  helpText?: string;
}

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL || '';
const ADMIN_BASE_URL = process.env.NEXT_PUBLIC_ADMIN_URL || '';

function useWebApps(tenantSlug: string | undefined) {
  const portalConfigured = PORTAL_BASE_URL.length > 0;
  const adminConfigured = ADMIN_BASE_URL.length > 0;

  const portalUrl = portalConfigured
    ? tenantSlug ? `${PORTAL_BASE_URL}/${tenantSlug}` : PORTAL_BASE_URL
    : undefined;

  const apps: WebApp[] = [
    {
      id: 'member-portal',
      name: 'Member Portal',
      description: 'Self-service portal for members to view statements, account details, and manage autopay.',
      icon: Users,
      status: portalConfigured ? 'active' : 'not_configured',
      portalUrl,
      helpText: portalConfigured
        ? 'Share this link with your members. They\'ll sign in with their email address.'
        : 'Set the NEXT_PUBLIC_PORTAL_URL environment variable to enable the member portal link.',
    },
    {
      id: 'admin-portal',
      name: 'Admin Portal',
      description: 'Platform administration panel for tenant management, eval QA, and user management.',
      icon: Shield,
      status: adminConfigured ? 'active' : 'not_configured',
      portalUrl: adminConfigured ? ADMIN_BASE_URL : undefined,
      helpText: adminConfigured
        ? 'Only platform administrators can access this portal.'
        : 'Set the NEXT_PUBLIC_ADMIN_URL environment variable to enable the admin portal link.',
    },
    {
      id: 'pay-at-table',
      name: 'Pay at Table',
      description: 'Customers scan a QR code on their receipt or enter a check code to pay and tip from their phone.',
      icon: QrCode,
      status: 'active',
      portalUrl: typeof window !== 'undefined' ? `${window.location.origin}/pay` : '/pay',
      helpText: 'This link is always available. Print QR codes on receipts or share the URL directly.',
    },
    {
      id: 'event-registration',
      name: 'Event Registration',
      description: 'Allow customers to browse and register for upcoming events.',
      icon: CalendarDays,
      status: 'coming_soon',
    },
    {
      id: 'online-shop',
      name: 'Online Shop',
      description: 'Customer-facing storefront for merchandise and gift cards.',
      icon: ShoppingBag,
      status: 'coming_soon',
    },
  ];

  return { apps };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

function statusBadge(status: WebApp['status']) {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-green-100 text-green-800' };
    case 'not_configured':
      return { label: 'Not Configured', className: 'bg-amber-100 text-amber-800' };
    case 'coming_soon':
      return { label: 'Coming Soon', className: 'bg-gray-100 text-gray-500' };
  }
}

function WebAppCard({ app }: { app: WebApp }) {
  const Icon = app.icon;
  const badge = statusBadge(app.status);

  return (
    <div className="bg-surface border rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
            app.status === 'active' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{app.name}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">{app.description}</p>

      {app.status === 'active' && app.portalUrl && (
        <div className="space-y-3">
          <div className="bg-gray-50 border rounded-md px-3 py-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm text-gray-800 truncate">{app.portalUrl}</code>
              <CopyButton text={app.portalUrl} />
            </div>
          </div>

          {app.helpText && (
            <p className="text-xs text-gray-500">{app.helpText}</p>
          )}

          <div className="flex gap-2">
            <a
              href={app.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </div>
        </div>
      )}

      {app.status === 'not_configured' && app.helpText && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {app.helpText}
        </p>
      )}
    </div>
  );
}

export default function WebAppsContent() {
  const { tenant } = useAuthContext();
  const { apps } = useWebApps(tenant?.slug);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Web Apps for Customers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage customer-facing web applications. Each app runs independently from the ERP.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <WebAppCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}
