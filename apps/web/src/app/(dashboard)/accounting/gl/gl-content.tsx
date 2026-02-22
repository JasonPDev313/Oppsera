'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { BookOpen, FileSpreadsheet, ArrowRightLeft, Repeat } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen },
  { id: 'journal-entries', label: 'Journal Entries', icon: FileSpreadsheet },
  { id: 'gl-mappings', label: 'GL Mappings', icon: ArrowRightLeft },
  { id: 'recurring', label: 'Recurring Templates', icon: Repeat },
];

const ChartOfAccounts = dynamic(() => import('../accounts/accounts-content'), { ssr: false });
const JournalEntries = dynamic(() => import('../journals/journals-content'), { ssr: false });
const GLMappings = dynamic(() => import('../mappings/mappings-content'), { ssr: false });
const RecurringTemplates = dynamic(() => import('../recurring/recurring-content'), { ssr: false });

export default function GLContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'chart-of-accounts';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AccountingSectionLayout
      sectionTitle="General Ledger"
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'chart-of-accounts' && <ChartOfAccounts />}
      {activeTab === 'journal-entries' && <JournalEntries />}
      {activeTab === 'gl-mappings' && <GLMappings />}
      {activeTab === 'recurring' && <RecurringTemplates />}
    </AccountingSectionLayout>
  );
}
