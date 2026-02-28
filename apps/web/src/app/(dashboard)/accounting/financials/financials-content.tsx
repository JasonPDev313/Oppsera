'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Scale, GitCompareArrows } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'statements', label: 'Statements', icon: Scale },
  { id: 'reconciliation', label: 'Reconciliation', icon: GitCompareArrows },
];

const Reports = dynamic(() => import('../reports/trial-balance/trial-balance-content'), { ssr: false });
const Statements = dynamic(() => import('../statements/profit-loss/pnl-content'), { ssr: false });
const Reconciliation = dynamic(() => import('@/components/accounting/revenue-reconciliation-tab'), { ssr: false });

export default function FinancialsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'reports';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Financials"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'reports' && <Reports />}
      {activeTab === 'statements' && <Statements />}
      {activeTab === 'reconciliation' && <Reconciliation />}
    </AccountingSectionLayout>
  );
}
