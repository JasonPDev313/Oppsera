'use client';

import { useState, useCallback } from 'react';
import {
  ShoppingCart,
  Ban,
  BookOpen,
  Shield,
  Lock,
  Ticket,
} from 'lucide-react';
import { OrderSearchPanel } from '@/components/finance/OrderSearchPanel';
import { OrderDetailPanel } from '@/components/finance/OrderDetailPanel';
import { VoidsRefundsPanel } from '@/components/finance/VoidsRefundsPanel';
import { GLIssuesPanel } from '@/components/finance/GLIssuesPanel';
import { ChargebacksPanel } from '@/components/finance/ChargebacksPanel';
import { CloseBatchesPanel } from '@/components/finance/CloseBatchesPanel';
import { VoucherLookupPanel } from '@/components/finance/VoucherLookupPanel';

type TabKey = 'orders' | 'voids-refunds' | 'gl-issues' | 'chargebacks' | 'close-batches' | 'vouchers';

interface Tab {
  key: TabKey;
  label: string;
  icon: typeof ShoppingCart;
}

const TABS: Tab[] = [
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'voids-refunds', label: 'Voids & Refunds', icon: Ban },
  { key: 'gl-issues', label: 'GL Issues', icon: BookOpen },
  { key: 'chargebacks', label: 'Chargebacks', icon: Shield },
  { key: 'close-batches', label: 'Close Batches', icon: Lock },
  { key: 'vouchers', label: 'Vouchers', icon: Ticket },
];

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('orders');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const handleSelectOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedOrderId(null);
  }, []);

  // When viewing order from voids/refunds tab, switch to orders tab and open detail
  const handleViewOrderFromVoids = useCallback((orderId: string) => {
    setActiveTab('orders');
    setSelectedOrderId(orderId);
  }, []);

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Financial Support Hub</h1>
        <p className="text-sm text-slate-400 mt-1">
          Cross-tenant order search, voids, refunds, GL troubleshooting, and more.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-slate-700 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-white border-indigo-500'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'orders' && (
          <OrderSearchPanel onSelectOrder={handleSelectOrder} />
        )}

        {activeTab === 'voids-refunds' && (
          <VoidsRefundsPanel onViewOrder={handleViewOrderFromVoids} />
        )}

        {activeTab === 'gl-issues' && <GLIssuesPanel />}

        {activeTab === 'chargebacks' && <ChargebacksPanel />}

        {activeTab === 'close-batches' && <CloseBatchesPanel />}

        {activeTab === 'vouchers' && <VoucherLookupPanel />}
      </div>

      {/* Order detail slide-over */}
      {selectedOrderId && (
        <OrderDetailPanel orderId={selectedOrderId} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
