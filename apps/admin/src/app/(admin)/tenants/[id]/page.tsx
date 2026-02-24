'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building,
  ExternalLink,
  Loader2,
  MapPin,
  Monitor,
  Users,
  Shield,
  Store,
} from 'lucide-react';
import { useTenantDetail } from '@/hooks/use-tenant-management';
import { adminFetch } from '@/lib/api-fetch';
import { TenantStatusBadge } from '@/components/tenants/TenantStatusBadge';
import { OrgHierarchyBuilder } from '@/components/tenants/OrgHierarchyBuilder';
import { ModuleManager } from '@/components/tenants/ModuleManager';
import { TenantRolesTab } from '@/components/tenants/TenantRolesTab';
import { TenantUsersTab } from '@/components/tenants/TenantUsersTab';

type Tab = 'overview' | 'organization' | 'modules' | 'roles' | 'users';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant, isLoading, error, load } = useTenantDetail(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [isImpersonating, setIsImpersonating] = useState(false);

  async function handleImpersonate() {
    setIsImpersonating(true);
    try {
      const res = await adminFetch<{ data: { url: string } }>(`/api/v1/tenants/${id}/impersonate`, {
        method: 'POST',
      });
      window.open(res.data.url, '_blank');
    } catch (err) {
      console.error('Failed to start impersonation:', err);
      alert('Failed to start impersonation session');
    } finally {
      setIsImpersonating(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && !tenant) {
    return <p className="text-slate-500 text-sm p-6">Loading tenant...</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm p-6">{error}</p>;
  }
  if (!tenant) {
    return <p className="text-slate-500 text-sm p-6">Tenant not found</p>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back */}
      <Link
        href="/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        All Tenants
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            <span className="font-mono">{tenant.slug}</span>
            <span className="mx-2 text-slate-600">·</span>
            Created {new Date(tenant.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleImpersonate}
          disabled={isImpersonating}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          {isImpersonating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ExternalLink size={14} />
          )}
          Login as Tenant
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700 pb-px">
        {(['overview', 'organization', 'modules', 'roles', 'users'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { overview: 'Overview', organization: 'Organization', modules: 'Modules', roles: 'Roles', users: 'Users' };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t
                  ? 'text-white bg-slate-800 border border-slate-700 border-b-transparent -mb-px'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab tenant={tenant} />}
      {tab === 'organization' && <OrgHierarchyBuilder tenantId={id} />}
      {tab === 'modules' && <ModuleManager tenantId={id} />}
      {tab === 'roles' && <TenantRolesTab tenantId={id} />}
      {tab === 'users' && <TenantUsersTab tenantId={id} />}
    </div>
  );
}

function OverviewTab({ tenant }: { tenant: NonNullable<ReturnType<typeof useTenantDetail>['tenant']> }) {
  const stats = [
    { label: 'Sites', value: tenant.siteCount, icon: Building, color: 'text-blue-400' },
    { label: 'Venues', value: tenant.venueCount, icon: Store, color: 'text-purple-400' },
    { label: 'Profit Centers', value: tenant.profitCenterCount, icon: MapPin, color: 'text-emerald-400' },
    { label: 'Terminals', value: tenant.terminalCount, icon: Monitor, color: 'text-amber-400' },
    { label: 'Users', value: tenant.userCount, icon: Users, color: 'text-cyan-400' },
    { label: 'Entitlements', value: tenant.entitlementCount, icon: Shield, color: 'text-indigo-400' },
  ];

  return (
    <div>
      {/* Zero-site warning */}
      {tenant.siteCount === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm mb-5">
          This tenant has no active sites. Switch to the Organization tab to create one.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-slate-800 rounded-xl border border-slate-700 p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={color} />
              <span className="text-sm text-slate-400">{label}</span>
            </div>
            <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Metadata */}
      <div className="mt-6 bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Tenant ID</dt>
          <dd className="text-slate-300 font-mono text-xs">{tenant.id}</dd>
          <dt className="text-slate-500">Slug</dt>
          <dd className="text-slate-300 font-mono">{tenant.slug}</dd>
          <dt className="text-slate-500">Billing Customer</dt>
          <dd className="text-slate-300 font-mono text-xs">{tenant.billingCustomerId ?? '—'}</dd>
          <dt className="text-slate-500">Last Updated</dt>
          <dd className="text-slate-300">{new Date(tenant.updatedAt).toLocaleString()}</dd>
        </dl>
      </div>
    </div>
  );
}
