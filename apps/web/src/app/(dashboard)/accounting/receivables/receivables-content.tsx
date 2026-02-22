'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Wallet, CreditCard, Users, Clock } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'invoices', label: 'Invoices', icon: Wallet },
  { id: 'receipts', label: 'Receipts', icon: CreditCard },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'aging', label: 'AR Aging', icon: Clock },
];

const Invoices = dynamic(() => import('../../ar/invoices/invoices-content'), { ssr: false });
const Receipts = dynamic(() => import('../../ar/receipts/receipts-content'), { ssr: false });
const Customers = dynamic(() => import('../../customers/customers-content'), { ssr: false });
const Aging = dynamic(() => import('../../ar/reports/aging/ar-aging-content'), { ssr: false });

export default function ReceivablesContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'invoices';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Receivables"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'invoices' && <Invoices />}
      {activeTab === 'receipts' && <Receipts />}
      {activeTab === 'customers' && <Customers />}
      {activeTab === 'aging' && <Aging />}
    </AccountingSectionLayout>
  );
}
