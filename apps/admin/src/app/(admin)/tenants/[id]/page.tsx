'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building,
  MapPin,
  Monitor,
  Users,
  Shield,
  Store,
  Mail,
  Phone,
  Calendar,
  Activity,
  Pencil,
} from 'lucide-react';
import { useTenantDetail } from '@/hooks/use-tenant-management';
import { adminFetch } from '@/lib/api-fetch';
import { EditTenantDialog } from '@/components/tenants/EditTenantDialog';
import { TenantStatusBadge } from '@/components/tenants/TenantStatusBadge';
import { OrgHierarchyBuilder } from '@/components/tenants/OrgHierarchyBuilder';
import { ModuleManager } from '@/components/tenants/ModuleManager';
import { FeatureFlagsPanel } from '@/components/tenants/FeatureFlagsPanel';
import { TenantRolesTab } from '@/components/tenants/TenantRolesTab';
import { TenantUsersTab } from '@/components/tenants/TenantUsersTab';
import { SubscriptionTab } from '@/components/tenants/SubscriptionTab';
import { OnboardingTab } from '@/components/tenants/OnboardingTab';
import { NotesTab } from '@/components/tenants/NotesTab';
import { ApiKeysTab } from '@/components/tenants/ApiKeysTab';
import { ImpersonateDialog } from '@/components/tenants/ImpersonateDialog';
import { ImpersonationHistoryTab } from '@/components/tenants/ImpersonationHistoryTab';

type Tab = 'overview' | 'organization' | 'modules' | 'roles' | 'users' | 'subscription' | 'onboarding' | 'notes' | 'impersonation' | 'api-keys';

const HEALTH_GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 bg-emerald-500/10',
  B: 'text-blue-400 bg-blue-500/10',
  C: 'text-amber-400 bg-amber-500/10',
  D: 'text-orange-400 bg-orange-500/10',
  F: 'text-red-400 bg-red-500/10',
};

const ONBOARDING_STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-400 bg-slate-500/10',
  in_progress: 'text-blue-400 bg-blue-500/10',
  completed: 'text-emerald-400 bg-emerald-500/10',
  stalled: 'text-red-400 bg-red-500/10',
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant, isLoading, error, load, update } = useTenantDetail(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [showImpersonateDialog, setShowImpersonateDialog] = useState(false);

  async function handleStatusAction(action: 'activate' | 'suspend' | 'reactivate') {
    try {
      let body = {};
      if (action === 'suspend') {
        const reason = prompt('Reason for suspension:');
        if (!reason) return;
        body = { reason };
      }
      await adminFetch(`/api/v1/tenants/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      alert(`Failed to ${action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'organization', label: 'Organization' },
    { key: 'modules', label: 'Modules' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'roles', label: 'Roles' },
    { key: 'users', label: 'Users' },
    { key: 'notes', label: 'Notes' },
    { key: 'api-keys', label: 'API Keys' },
    { key: 'impersonation', label: 'Impersonation' },
  ];

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
            {tenant.healthGrade && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${HEALTH_GRADE_COLORS[tenant.healthGrade] ?? ''}`}>
                {tenant.healthGrade}
              </span>
            )}
            {tenant.onboardingStatus && tenant.onboardingStatus !== 'completed' && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${ONBOARDING_STATUS_COLORS[tenant.onboardingStatus] ?? ''}`}>
                {tenant.onboardingStatus.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            <span className="font-mono">{tenant.slug}</span>
            {tenant.industry && (
              <>
                <span className="mx-2 text-slate-600">·</span>
                <span className="capitalize">{tenant.industry}</span>
              </>
            )}
            <span className="mx-2 text-slate-600">·</span>
            Created {new Date(tenant.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {tenant.status === 'suspended' && (
            <button
              onClick={() => handleStatusAction('reactivate')}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Reactivate
            </button>
          )}
          {tenant.status === 'active' && (
            <button
              onClick={() => handleStatusAction('suspend')}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Suspend
            </button>
          )}
          {tenant.status === 'pending' && (
            <button
              onClick={() => handleStatusAction('activate')}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => setShowImpersonateDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Shield size={14} />
            Impersonate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700 pb-px overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'text-white bg-slate-800 border border-slate-700 border-b-transparent -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab tenant={tenant} onUpdate={update} />}
      {tab === 'onboarding' && <OnboardingTab tenantId={id} industry={tenant.industry} />}
      {tab === 'organization' && <OrgHierarchyBuilder tenantId={id} />}
      {tab === 'modules' && (
        <div className="space-y-8">
          <ModuleManager tenantId={id} />
          <FeatureFlagsPanel tenantId={id} />
        </div>
      )}
      {tab === 'subscription' && <SubscriptionTab tenantId={id} />}
      {tab === 'roles' && <TenantRolesTab tenantId={id} />}
      {tab === 'users' && <TenantUsersTab tenantId={id} />}
      {tab === 'notes' && <NotesTab tenantId={id} />}
      {tab === 'api-keys' && <ApiKeysTab tenantId={id} />}
      {tab === 'impersonation' && <ImpersonationHistoryTab tenantId={id} />}

      {/* Impersonation Dialog */}
      <ImpersonateDialog
        tenantId={id}
        tenantName={tenant.name}
        open={showImpersonateDialog}
        onClose={() => setShowImpersonateDialog(false)}
      />
    </div>
  );
}

function OverviewTab({ tenant, onUpdate }: { tenant: NonNullable<ReturnType<typeof useTenantDetail>['tenant']>; onUpdate: (body: Record<string, unknown>) => Promise<void> }) {
  const [showEditDialog, setShowEditDialog] = useState(false);

  const stats = [
    { label: 'Sites', value: tenant.siteCount, icon: Building, color: 'text-blue-400' },
    { label: 'Venues', value: tenant.venueCount, icon: Store, color: 'text-purple-400' },
    { label: 'Profit Centers', value: tenant.profitCenterCount, icon: MapPin, color: 'text-emerald-400' },
    { label: 'Terminals', value: tenant.terminalCount, icon: Monitor, color: 'text-amber-400' },
    { label: 'Users', value: tenant.userCount, icon: Users, color: 'text-cyan-400' },
    { label: 'Entitlements', value: tenant.entitlementCount, icon: Shield, color: 'text-indigo-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Edit button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowEditDialog(true)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
        >
          <Pencil size={14} />
          Edit Tenant Info
        </button>
      </div>

      {/* Zero-site warning */}
      {tenant.siteCount === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm">
          This tenant has no active sites. Switch to the Organization tab to create one.
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={color} />
              <span className="text-sm text-slate-400">{label}</span>
            </div>
            <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Contact & Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Primary Contact */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
            <Users size={14} />
            Primary Contact
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-20">Name</dt>
              <dd className="text-slate-300">{tenant.primaryContactName ?? '—'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-20 flex items-center gap-1"><Mail size={12} /> Email</dt>
              <dd className="text-slate-300">{tenant.primaryContactEmail ?? '—'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-20 flex items-center gap-1"><Phone size={12} /> Phone</dt>
              <dd className="text-slate-300">{tenant.primaryContactPhone ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Details */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28">Tenant ID</dt>
              <dd className="text-slate-300 font-mono text-xs">{tenant.id}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28">Slug</dt>
              <dd className="text-slate-300 font-mono">{tenant.slug}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28">Industry</dt>
              <dd className="text-slate-300 capitalize">{tenant.industry ?? '—'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28">Health Grade</dt>
              <dd>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${HEALTH_GRADE_COLORS[tenant.healthGrade] ?? ''}`}>
                  {tenant.healthGrade}
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28 flex items-center gap-1"><Activity size={12} /> Last Activity</dt>
              <dd className="text-slate-300">{tenant.lastActivityAt ? new Date(tenant.lastActivityAt).toLocaleString() : '—'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-500 w-28 flex items-center gap-1"><Calendar size={12} /> Activated</dt>
              <dd className="text-slate-300">{tenant.activatedAt ? new Date(tenant.activatedAt).toLocaleString() : '—'}</dd>
            </div>
            {tenant.suspendedAt && (
              <div className="flex items-center gap-2">
                <dt className="text-slate-500 w-28">Suspended</dt>
                <dd className="text-red-400">
                  {new Date(tenant.suspendedAt).toLocaleString()}
                  {tenant.suspendedReason && <span className="text-xs ml-2">({tenant.suspendedReason})</span>}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Internal Notes (quick inline field) */}
      {tenant.internalNotes && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Internal Notes</h3>
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{tenant.internalNotes}</p>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <EditTenantDialog
          tenant={tenant}
          onClose={() => setShowEditDialog(false)}
          onSave={onUpdate}
        />
      )}
    </div>
  );
}
