'use client';

import { useState } from 'react';
import {
  Shield,
  Building2,
  ShieldAlert,
  Download,
} from 'lucide-react';
import { PlatformAuditPanel } from '@/components/audit/PlatformAuditPanel';
import { TenantAuditPanel } from '@/components/audit/TenantAuditPanel';
import { ImpersonationAuditPanel } from '@/components/audit/ImpersonationAuditPanel';
import { AuditExportPanel } from '@/components/audit/AuditExportPanel';

type TabKey = 'platform' | 'tenant' | 'impersonation' | 'export';

interface Tab {
  key: TabKey;
  label: string;
  icon: typeof Shield;
}

const TABS: Tab[] = [
  { key: 'platform', label: 'Platform Actions', icon: Shield },
  { key: 'tenant', label: 'Tenant Activity', icon: Building2 },
  { key: 'impersonation', label: 'Impersonation Log', icon: ShieldAlert },
  { key: 'export', label: 'Export', icon: Download },
];

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('platform');

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-1">
          Who did what, when, and why &mdash; platform admin actions, tenant activity, and impersonation history.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-slate-700 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-white border-indigo-500'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'platform' && <PlatformAuditPanel />}
        {activeTab === 'tenant' && <TenantAuditPanel />}
        {activeTab === 'impersonation' && <ImpersonationAuditPanel />}
        {activeTab === 'export' && <AuditExportPanel />}
      </div>
    </div>
  );
}
