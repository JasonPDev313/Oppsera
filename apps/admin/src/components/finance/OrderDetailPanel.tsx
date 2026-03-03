'use client';

import { useEffect } from 'react';
import { X, CreditCard, BookOpen, Clock, ArrowRight } from 'lucide-react';
import { useOrderDetail } from '@/hooks/use-finance';
import { formatCents, formatDateTime, formatDate } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';

interface OrderDetailPanelProps {
  orderId: string;
  onClose: () => void;
}

export function OrderDetailPanel({ orderId, onClose }: OrderDetailPanelProps) {
  const { data, isLoading, error, load } = useOrderDetail();

  useEffect(() => {
    load(orderId);
  }, [orderId, load]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-slate-900 border-l border-slate-700 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Order Detail</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Loading */}
          {isLoading && (
            <div className="text-slate-500 text-sm text-center py-12">Loading order details...</div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {data && (
            <>
              {/* Order Header */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white font-mono text-lg font-semibold">
                      #{String(data.order.order_number ?? '')}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      {String(data.order.tenant_name ?? '')} &middot;{' '}
                      {String(data.order.location_name ?? '')}
                    </p>
                  </div>
                  <StatusBadge status={String(data.order.status ?? 'unknown')} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">Date</p>
                    <p className="text-white">
                      {formatDate(data.order.business_date as string | null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Employee</p>
                    <p className="text-white">
                      {String(data.order.employee_name ?? '\u2014')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Customer</p>
                    <p className="text-white">
                      {String(data.order.customer_name ?? '\u2014')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Source</p>
                    <p className="text-white capitalize">
                      {String(data.order.source ?? '\u2014')}
                    </p>
                  </div>
                </div>

                {data.order.status === 'voided' && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                    <p className="text-xs font-medium text-red-400">VOIDED</p>
                    <p className="text-sm text-red-300 mt-1">
                      Reason: {String(data.order.void_reason ?? 'No reason given')}
                    </p>
                    <p className="text-xs text-red-400/60 mt-1">
                      By {String(data.order.voided_by_name ?? 'Unknown')} on{' '}
                      {formatDateTime(data.order.voided_at as string | null)}
                    </p>
                  </div>
                )}
              </div>

              {/* Order Lines */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700">
                  <h3 className="text-sm font-medium text-white">
                    Order Lines ({data.lines.length})
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-5 py-2.5 font-medium text-slate-400 text-xs">
                        Item
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium text-slate-400 text-xs">
                        Qty
                      </th>
                      <th className="text-right px-3 py-2.5 font-medium text-slate-400 text-xs">
                        Unit Price
                      </th>
                      <th className="text-right px-3 py-2.5 font-medium text-slate-400 text-xs">
                        Tax
                      </th>
                      <th className="text-right px-5 py-2.5 font-medium text-slate-400 text-xs">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {data.lines.map((line) => {
                      const isVoided = data.order.status === 'voided';
                      return (
                        <tr key={String(line.id)} className={isVoided ? 'opacity-50' : ''}>
                          <td className="px-5 py-2.5">
                            <span
                              className={`text-white text-xs ${isVoided ? 'line-through text-red-400' : ''}`}
                            >
                              {String(line.catalog_item_name ?? 'Unknown Item')}
                            </span>
                            {line.catalog_item_sku != null && (
                              <span className="text-slate-500 text-xs ml-2 font-mono">
                                {String(line.catalog_item_sku)}
                              </span>
                            )}
                            {line.price_override_reason != null && (
                              <span className="block text-xs text-amber-400 mt-0.5">
                                Price override: {String(line.price_override_reason)}
                              </span>
                            )}
                          </td>
                          <td className={`text-center px-3 py-2.5 text-xs ${isVoided ? 'text-red-400' : 'text-slate-300'}`}>
                            {String(line.qty ?? 0)}
                          </td>
                          <td className={`text-right px-3 py-2.5 text-xs ${isVoided ? 'text-red-400 line-through' : 'text-slate-300'}`}>
                            {formatCents(Number(line.unit_price ?? 0))}
                          </td>
                          <td className={`text-right px-3 py-2.5 text-xs ${isVoided ? 'text-red-400' : 'text-slate-400'}`}>
                            {formatCents(Number(line.line_tax ?? 0))}
                          </td>
                          <td className={`text-right px-5 py-2.5 text-xs font-medium ${isVoided ? 'text-red-400 line-through' : 'text-white'}`}>
                            {formatCents(Number(line.line_total ?? 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="border-t border-slate-700 px-5 py-3 space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Subtotal</span>
                    <span>{formatCents(Number(data.order.subtotal ?? 0))}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Tax</span>
                    <span>{formatCents(Number(data.order.tax_total ?? 0))}</span>
                  </div>
                  {Number(data.order.discount_total ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-emerald-400">
                      <span>Discount</span>
                      <span>-{formatCents(Number(data.order.discount_total))}</span>
                    </div>
                  )}
                  {Number(data.order.service_charge_total ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Service Charge</span>
                      <span>{formatCents(Number(data.order.service_charge_total))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-white pt-1 border-t border-slate-700">
                    <span>Total</span>
                    <span>{formatCents(Number(data.order.total ?? 0))}</span>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {data.tenders.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
                    <CreditCard size={14} className="text-slate-400" />
                    <h3 className="text-sm font-medium text-white">
                      Payments ({data.tenders.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {data.tenders.map((tender) => (
                      <div key={String(tender.id)} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-white text-xs font-medium capitalize">
                              {String(tender.tender_type ?? '')}
                            </span>
                            {tender.card_brand != null && (
                              <span className="text-slate-400 text-xs">
                                {String(tender.card_brand)} ****{String(tender.card_last4 ?? '')}
                              </span>
                            )}
                            <StatusBadge status={String(tender.status ?? 'unknown')} />
                          </div>
                          <span className="text-white text-sm font-medium">
                            {formatCents(Number(tender.amount ?? 0))}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
                          {tender.employee_name != null && (
                            <span>By {String(tender.employee_name)}</span>
                          )}
                          {tender.provider_ref != null && (
                            <span className="font-mono">Ref: {String(tender.provider_ref)}</span>
                          )}
                          {Number(tender.tip_amount ?? 0) > 0 && (
                            <span className="text-emerald-400">
                              Tip: {formatCents(Number(tender.tip_amount))}
                            </span>
                          )}
                          {Number(tender.surcharge_amount_cents ?? 0) > 0 && (
                            <span className="text-amber-400">
                              Surcharge: {formatCents(Number(tender.surcharge_amount_cents))}
                            </span>
                          )}
                          <span>{formatDateTime(tender.created_at as string | null)}</span>
                        </div>

                        {/* Reversal info */}
                        {tender.reversal_id != null && (
                          <div className="mt-2 ml-4 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-red-400 font-medium capitalize">
                                {String(tender.reversal_type ?? 'Reversal')}
                              </span>
                              <span className="text-red-300">
                                {formatCents(Number(tender.reversal_amount ?? 0))}
                              </span>
                              <StatusBadge status={String(tender.reversal_status ?? '')} />
                            </div>
                            {tender.reversal_reason != null && (
                              <p className="text-xs text-red-400/80 mt-1">
                                Reason: {String(tender.reversal_reason)}
                              </p>
                            )}
                            <p className="text-xs text-slate-500 mt-0.5">
                              {tender.reversal_created_by_name
                                ? `By ${String(tender.reversal_created_by_name)} `
                                : ''}
                              {formatDateTime(tender.reversal_created_at as string | null)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GL Postings */}
              {data.glEntries.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
                    <BookOpen size={14} className="text-slate-400" />
                    <h3 className="text-sm font-medium text-white">
                      GL Postings ({data.glEntries.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {data.glEntries.map((entry) => (
                      <div key={String(entry.id)} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-xs font-mono">
                              {String(entry.journal_number ?? '')}
                            </span>
                            <StatusBadge status={String(entry.status ?? '')} />
                          </div>
                          <span className="text-xs text-slate-400">
                            {formatDate(entry.business_date as string | null)}
                          </span>
                        </div>
                        {entry.memo != null && (
                          <p className="text-xs text-slate-500 mb-2">{String(entry.memo)}</p>
                        )}
                        {entry.void_reason != null && (
                          <p className="text-xs text-red-400 mb-2">
                            Void reason: {String(entry.void_reason)}
                          </p>
                        )}

                        {/* Journal lines */}
                        {entry.lines.length > 0 && (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left py-1 font-medium">Account</th>
                                <th className="text-right py-1 font-medium">Debit</th>
                                <th className="text-right py-1 font-medium">Credit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                              {entry.lines.map((line) => (
                                <tr key={String(line.id)}>
                                  <td className="py-1 text-slate-300">
                                    <span className="font-mono text-slate-500 mr-2">
                                      {String(line.account_number ?? '')}
                                    </span>
                                    {String(line.account_name ?? '')}
                                  </td>
                                  <td className="py-1 text-right text-slate-300">
                                    {Number(line.debit_amount ?? 0) > 0
                                      ? `$${Number(line.debit_amount).toFixed(2)}`
                                      : ''}
                                  </td>
                                  <td className="py-1 text-right text-slate-300">
                                    {Number(line.credit_amount ?? 0) > 0
                                      ? `$${Number(line.credit_amount).toFixed(2)}`
                                      : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {data.timeline.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <h3 className="text-sm font-medium text-white">Timeline</h3>
                  </div>
                  <div className="px-5 py-3 space-y-3">
                    {data.timeline.map((event, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="mt-1 flex-shrink-0">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              event.event === 'voided'
                                ? 'bg-red-400'
                                : event.event === 'paid'
                                  ? 'bg-emerald-400'
                                  : event.event === 'placed'
                                    ? 'bg-indigo-400'
                                    : event.event.startsWith('tender_')
                                      ? 'bg-blue-400'
                                      : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white font-medium capitalize">
                              {event.event.replace(/_/g, ' ')}
                            </span>
                            {event.actor != null && (
                              <>
                                <ArrowRight size={10} className="text-slate-600" />
                                <span className="text-xs text-slate-400">
                                  {String(event.actor)}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDateTime(event.timestamp as string | null)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Trail */}
              {data.auditTrail.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-700">
                    <h3 className="text-sm font-medium text-white">
                      Audit Trail ({data.auditTrail.length})
                    </h3>
                  </div>
                  <div className="px-5 py-3 space-y-2">
                    {data.auditTrail.map((entry) => (
                      <div
                        key={String(entry.id)}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">
                            {String(entry.action ?? '')}
                          </span>
                          {entry.actor_name != null && (
                            <span className="text-slate-400">
                              by {String(entry.actor_name)}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-500">
                          {formatDateTime(entry.created_at as string | null)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
