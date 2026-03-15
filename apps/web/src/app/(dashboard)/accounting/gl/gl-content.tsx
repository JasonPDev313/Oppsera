'use client';

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { BookOpen, FileSpreadsheet, ArrowRightLeft, Repeat, FileBarChart } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';

const tabs: SectionTab[] = [
  { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen },
  { id: 'journal-entries', label: 'Journal Entries', icon: FileSpreadsheet },
  { id: 'gl-mappings', label: 'GL Mappings', icon: ArrowRightLeft },
  { id: 'recurring', label: 'Recurring Templates', icon: Repeat },
  { id: 'gl-code-summary', label: 'GL Code Summary', icon: FileBarChart },
];

const ChartOfAccounts = dynamic(() => import('../accounts/accounts-content'), { ssr: false });
const JournalEntries = dynamic(() => import('../journals/journals-content'), { ssr: false });
const GLMappings = dynamic(() => import('../mappings/mappings-content'), { ssr: false });
const RecurringTemplates = dynamic(() => import('../recurring/recurring-content'), { ssr: false });
const GLCodeSummary = dynamic(() => import('../reports/gl-code-summary/gl-code-summary-content'), { ssr: false });

export default function GLContent() {
  return (
    <Suspense fallback={null}>
      <GLContentInner />
    </Suspense>
  );
}

const validTabIds = new Set(tabs.map((t) => t.id));

function GLContentInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('chart-of-accounts');

  // Sync tab from URL after mount to avoid hydration mismatch
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && validTabIds.has(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

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
      {activeTab === 'gl-code-summary' && <GLCodeSummary />}
    </AccountingSectionLayout>
  );
}
