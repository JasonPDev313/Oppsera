'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { FileBarChart, BarChart3 } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'remittance', label: 'Tax Remittance', icon: FileBarChart },
  { id: 'reports', label: 'Tax Reports', icon: BarChart3 },
];

const TaxRemittance = dynamic(() => import('../reports/tax-remittance/tax-remittance-content'), { ssr: false });
const SalesTax = dynamic(() => import('../reports/sales-tax/sales-tax-content'), { ssr: false });

export default function TaxContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'remittance';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Tax"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'remittance' && <TaxRemittance />}
      {activeTab === 'reports' && <SalesTax />}
    </AccountingSectionLayout>
  );
}
