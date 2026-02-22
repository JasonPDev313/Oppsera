'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Receipt, DollarSign, Truck, Clock } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'bills', label: 'Bills', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'vendors', label: 'Vendors', icon: Truck },
  { id: 'aging', label: 'AP Aging', icon: Clock },
];

const Bills = dynamic(() => import('../../ap/bills/bills-content'), { ssr: false });
const Payments = dynamic(() => import('../../ap/payments/payments-content'), { ssr: false });
const Vendors = dynamic(() => import('../../vendors/vendors-content'), { ssr: false });
const Aging = dynamic(() => import('../../ap/reports/aging/ap-aging-content'), { ssr: false });

export default function PayablesContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'bills';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Payables"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'bills' && <Bills />}
      {activeTab === 'payments' && <Payments />}
      {activeTab === 'vendors' && <Vendors />}
      {activeTab === 'aging' && <Aging />}
    </AccountingSectionLayout>
  );
}
