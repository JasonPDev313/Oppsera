'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Building2, Banknote, ArrowRightLeft, CreditCard, CheckSquare } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'bank-accounts', label: 'Bank Accounts', icon: Building2 },
  { id: 'deposits', label: 'Deposits', icon: Banknote },
  { id: 'reconciliation', label: 'Reconciliation', icon: ArrowRightLeft },
  { id: 'bank-rec', label: 'Bank Rec', icon: CheckSquare },
  { id: 'settlements', label: 'Settlements', icon: CreditCard },
];

const BankAccounts = dynamic(() => import('../banks/banks-content'), { ssr: false });
const Deposits = dynamic(() => import('../deposits/deposits-content'), { ssr: false });
const Reconciliation = dynamic(() => import('../reconciliation/reconciliation-content'), { ssr: false });
const BankReconciliation = dynamic(() => import('../bank-reconciliation/bank-reconciliation-content'), { ssr: false });
const Settlements = dynamic(() => import('../settlements/settlements-content'), { ssr: false });

export default function BankingContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'bank-accounts';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="Banking"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'bank-accounts' && <BankAccounts />}
      {activeTab === 'deposits' && <Deposits />}
      {activeTab === 'reconciliation' && <Reconciliation />}
      {activeTab === 'bank-rec' && <BankReconciliation />}
      {activeTab === 'settlements' && <Settlements />}
    </AccountingSectionLayout>
  );
}
