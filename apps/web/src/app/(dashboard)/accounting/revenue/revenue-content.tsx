'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PackageCheck, Banknote, TrendingUp } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'sales', label: 'Sales Activity', icon: TrendingUp },
  { id: 'cogs', label: 'COGS', icon: PackageCheck },
  { id: 'tip-payouts', label: 'Tip Payouts', icon: Banknote },
];

const SalesActivity = dynamic(() => import('@/components/accounting/sales-activity-tab'), { ssr: false });
const COGS = dynamic(() => import('../cogs/cogs-content'), { ssr: false });
const TipPayouts = dynamic(() => import('../tip-payouts/tip-payouts-content'), { ssr: false });

export default function RevenueContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'sales';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Revenue & Cost"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'sales' && <SalesActivity />}
      {activeTab === 'cogs' && <COGS />}
      {activeTab === 'tip-payouts' && <TipPayouts />}
    </AccountingSectionLayout>
  );
}
