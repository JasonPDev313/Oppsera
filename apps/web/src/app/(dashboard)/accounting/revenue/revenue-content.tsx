'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { PackageCheck, Banknote } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'cogs', label: 'COGS', icon: PackageCheck },
  { id: 'tip-payouts', label: 'Tip Payouts', icon: Banknote },
];

const COGS = dynamic(() => import('../cogs/cogs-content'), { ssr: false });
const TipPayouts = dynamic(() => import('../tip-payouts/tip-payouts-content'), { ssr: false });

export default function RevenueContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'cogs';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Revenue & Cost"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'cogs' && <COGS />}
      {activeTab === 'tip-payouts' && <TipPayouts />}
    </AccountingSectionLayout>
  );
}
