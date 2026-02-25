'use client';

import { useState } from 'react';
import ProvidersTab from '@/components/settings/merchant-services/ProvidersTab';
import MerchantAccountsTab from '@/components/settings/merchant-services/MerchantAccountsTab';
import TerminalsTab from '@/components/settings/merchant-services/TerminalsTab';
import DevicesTab from '@/components/settings/merchant-services/DevicesTab';
import WalletsTab from '@/components/settings/merchant-services/WalletsTab';
import SurchargingTab from '@/components/settings/merchant-services/SurchargingTab';
import AchSettingsTab from '@/components/settings/merchant-services/AchSettingsTab';

type Tab = 'providers' | 'mids' | 'terminals' | 'devices' | 'wallets' | 'surcharging' | 'ach';

const TABS: { key: Tab; label: string }[] = [
  { key: 'providers', label: 'Providers' },
  { key: 'mids', label: 'Merchant Accounts' },
  { key: 'terminals', label: 'Terminal Assignments' },
  { key: 'devices', label: 'Devices' },
  { key: 'wallets', label: 'Wallet Payments' },
  { key: 'surcharging', label: 'Surcharging' },
  { key: 'ach', label: 'ACH Settings' },
];

export default function MerchantServicesContent() {
  const [tab, setTab] = useState<Tab>('providers');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Merchant Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure payment providers, merchant IDs, and terminal assignments.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${
                tab === key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content — each tab owns its own hooks so only the active tab fetches data */}
      {tab === 'providers' && <ProvidersTab onNavigateToMids={() => setTab('mids')} />}
      {tab === 'mids' && <MerchantAccountsTab />}
      {tab === 'terminals' && <TerminalsTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'wallets' && <WalletsTab />}
      {tab === 'surcharging' && <SurchargingTab />}
      {tab === 'ach' && <AchSettingsTab />}
    </div>
  );
}
