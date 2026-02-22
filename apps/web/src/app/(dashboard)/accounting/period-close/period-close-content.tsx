'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Monitor, Clock, Lock } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'operations', label: 'Operations', icon: Monitor },
  { id: 'close-dashboard', label: 'Close Dashboard', icon: Clock },
  { id: 'period-close', label: 'Period Locks', icon: Lock },
];

const Operations = dynamic(() => import('../../operations/operations-dashboard/operations-content'), { ssr: false });
const CloseDashboard = dynamic(() => import('../../operations/close-dashboard/close-dashboard-content'), { ssr: false });
const PeriodLocks = dynamic(() => import('../close/close-content'), { ssr: false });

export default function PeriodCloseContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'operations';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Period Close"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'operations' && <Operations />}
      {activeTab === 'close-dashboard' && <CloseDashboard />}
      {activeTab === 'period-close' && <PeriodLocks />}
    </AccountingSectionLayout>
  );
}
