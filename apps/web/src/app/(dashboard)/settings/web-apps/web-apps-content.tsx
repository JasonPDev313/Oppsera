'use client';

import { useState } from 'react';
import { Globe, Copy, ExternalLink, Check, Users, CalendarDays, ShoppingBag } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';

interface WebApp {
  id: string;
  name: string;
  description: string;
  icon: typeof Globe;
  status: 'active' | 'coming_soon';
  portalUrl?: string;
}

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3002';

function useWebApps(tenantSlug: string | undefined) {
  // V1: static list. V2: fetch from API with tenant-specific config.
  const portalUrl = tenantSlug
    ? `${PORTAL_BASE_URL}/${tenantSlug}`
    : PORTAL_BASE_URL;

  const apps: WebApp[] = [
    {
      id: 'member-portal',
      name: 'Member Portal',
      description: 'Self-service portal for members to view statements, account details, and manage autopay.',
      icon: Users,
      status: 'active',
      portalUrl,
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

function WebAppCard({ app }: { app: WebApp }) {
  const Icon = app.icon;
  const isActive = app.status === 'active';

  return (
    <div className="bg-surface border rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
            isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{app.name}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              isActive
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {isActive ? 'Active' : 'Coming Soon'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">{app.description}</p>

      {isActive && app.portalUrl && (
        <div className="space-y-3">
          <div className="bg-gray-50 border rounded-md px-3 py-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Portal URL</label>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm text-gray-800 truncate">{app.portalUrl}</code>
              <CopyButton text={app.portalUrl} />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Share this link with your members. They'll sign in with their email address.
          </p>

          <div className="flex gap-2">
            <a
              href={app.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Portal
            </a>
          </div>
        </div>
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
