'use client';

import { useState, useCallback } from 'react';
import { Banknote, DollarSign, Users, Clock } from 'lucide-react';
import { useTipBalances, useTipPayouts, useTipPayoutMutations } from '@/hooks/use-tip-payouts';
import { TipPayoutDialog } from '@/components/accounting/TipPayoutDialog';
import {
  TIP_PAYOUT_STATUS_CONFIG,
  TIP_PAYOUT_TYPE_CONFIG,
  type TipBalanceItem,
} from '@/types/accounting';

type Tab = 'balances' | 'history';

export default function TipPayoutsContent() {
  const [activeTab, setActiveTab] = useState<Tab>('balances');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<TipBalanceItem | null>(null);

  const { data: balances, isLoading: balancesLoading, refresh: refreshBalances } = useTipBalances();
  const { items: payouts, isLoading: payoutsLoading, hasMore, loadMore, refresh: refreshPayouts } = useTipPayouts({ status: statusFilter || undefined });
  const { createPayout, voidPayout, isLoading: mutating } = useTipPayoutMutations();

  const totalOutstanding = balances.reduce((sum, b) => sum + b.balanceCents, 0);
  const employeesWithBalance = balances.length;

  const handlePayOut = useCallback((employee: TipBalanceItem) => {
    setSelectedEmployee(employee);
    setDialogOpen(true);
  }, []);

  const handlePayoutSubmit = useCallback(async (input: {
    payoutType: 'cash' | 'payroll' | 'check';
    amountCents: number;
    notes?: string;
  }) => {
    if (!selectedEmployee) return;

    await createPayout({
      locationId: '', // Will be resolved from context
      employeeId: selectedEmployee.employeeId,
      payoutType: input.payoutType,
      amountCents: input.amountCents,
      businessDate: new Date().toISOString().slice(0, 10),
      notes: input.notes,
    });

    setDialogOpen(false);
    setSelectedEmployee(null);
    refreshBalances();
    refreshPayouts();
  }, [selectedEmployee, createPayout, refreshBalances, refreshPayouts]);

  const handleVoid = useCallback(async (payoutId: string) => {
    const reason = prompt('Enter void reason:');
    if (!reason) return;
    await voidPayout(payoutId, reason);
    refreshBalances();
    refreshPayouts();
  }, [voidPayout, refreshBalances, refreshPayouts]);

  const formatMoney = (cents: number) => {
    const dollars = cents / 100;
    return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tip Payouts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and pay out employee tip balances
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <DollarSign className="h-4 w-4" />
            Outstanding Tips
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(totalOutstanding)}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Users className="h-4 w-4" />
            Employees with Balance
          </div>
          <p className="text-2xl font-bold text-gray-900">{employeesWithBalance}</p>
        </div>
        <div className="bg-surface border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Clock className="h-4 w-4" />
            As of
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('balances')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'balances'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Balances
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Payout History
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'balances' ? (
        <div className="bg-surface border border-gray-200 rounded-lg overflow-hidden">
          {balancesLoading ? (
            <div className="p-8 text-center text-gray-500">Loading tip balances...</div>
          ) : balances.length === 0 ? (
            <div className="p-12 text-center">
              <Banknote className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-medium text-gray-900">No outstanding tips</h3>
              <p className="mt-1 text-sm text-gray-500">
                All employee tip balances are settled.
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Tips</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid Out</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Tip</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {balances.map((b) => (
                  <tr key={b.employeeId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {b.employeeName ?? b.employeeId.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">
                      {formatMoney(b.totalTipsCents)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-right">
                      {formatMoney(b.totalPaidCents)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                      {formatMoney(b.balanceCents)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 text-right">
                      {b.lastTipDate ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handlePayOut(b)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        Pay Out
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div>
          {/* Status filter */}
          <div className="flex gap-2 mb-4">
            {['', 'completed', 'voided'].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-surface border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s ? TIP_PAYOUT_STATUS_CONFIG[s as keyof typeof TIP_PAYOUT_STATUS_CONFIG]?.label : 'All'}
              </button>
            ))}
          </div>

          <div className="bg-surface border border-gray-200 rounded-lg overflow-hidden">
            {payoutsLoading ? (
              <div className="p-8 text-center text-gray-500">Loading payout history...</div>
            ) : payouts.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-sm font-medium text-gray-900">No payouts yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Tip payouts will appear here after they are processed.
                </p>
              </div>
            ) : (
              <>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GL Ref</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payouts.map((p) => {
                      const statusCfg = TIP_PAYOUT_STATUS_CONFIG[p.status as keyof typeof TIP_PAYOUT_STATUS_CONFIG];
                      const typeCfg = TIP_PAYOUT_TYPE_CONFIG[p.payoutType as keyof typeof TIP_PAYOUT_TYPE_CONFIG];
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-600">{p.businessDate}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {p.employeeName ?? p.employeeId.slice(0, 8)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {typeCfg?.label ?? p.payoutType}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                            {formatMoney(p.amountCents)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                              statusCfg?.variant === 'success' ? 'bg-green-50 text-green-700' :
                              statusCfg?.variant === 'error' ? 'bg-red-50 text-red-700' :
                              'bg-yellow-50 text-yellow-700'
                            }`}>
                              {statusCfg?.label ?? p.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {p.glJournalEntryId ? (
                              <a
                                href={`/accounting/journals?id=${p.glJournalEntryId}`}
                                className="text-indigo-600 hover:text-indigo-500"
                              >
                                View
                              </a>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {p.status === 'completed' && (
                              <button
                                onClick={() => handleVoid(p.id)}
                                disabled={mutating}
                                className="text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasMore && (
                  <div className="p-4 text-center border-t border-gray-200">
                    <button
                      onClick={loadMore}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Pay Out Dialog */}
      <TipPayoutDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setSelectedEmployee(null); }}
        employee={selectedEmployee}
        onSubmit={handlePayoutSubmit}
        isLoading={mutating}
      />
    </div>
  );
}
