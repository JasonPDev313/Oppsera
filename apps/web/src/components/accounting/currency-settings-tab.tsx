'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Globe, TrendingUp, AlertTriangle } from 'lucide-react';
import { SUPPORTED_CURRENCIES, getSortedCurrencies } from '@oppsera/shared';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import {
  useSupportedCurrencies,
  useUpdateSupportedCurrencies,
  useExchangeRates,
  useUpdateExchangeRate,
  useUnrealizedGainLoss,
} from '@/hooks/use-currency-settings';

// ── Exchange Rate Table ─────────────────────────────────────

interface ExchangeRateFormRow {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
}

function ExchangeRateTable({
  baseCurrency,
  supportedCurrencies,
}: {
  baseCurrency: string;
  supportedCurrencies: string[];
}) {
  const { data: ratesData, isLoading } = useExchangeRates({ toCurrency: baseCurrency, limit: 100 });
  const updateRate = useUpdateExchangeRate();
  const { toast } = useToast();

  const foreignCurrencies = supportedCurrencies.filter((c) => c !== baseCurrency);

  const [newRow, setNewRow] = useState<ExchangeRateFormRow>({
    fromCurrency: foreignCurrencies[0] ?? '',
    toCurrency: baseCurrency,
    rate: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
  });

  const handleAddRate = useCallback(async () => {
    if (!newRow.rate || !newRow.fromCurrency) return;
    const rateNum = parseFloat(newRow.rate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast.error('Rate must be a positive number');
      return;
    }
    try {
      await updateRate.mutateAsync({
        fromCurrency: newRow.fromCurrency,
        toCurrency: baseCurrency,
        rate: rateNum,
        effectiveDate: newRow.effectiveDate,
        source: 'manual',
      });
      toast.success('Exchange rate saved');
      setNewRow((r) => ({ ...r, rate: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rate');
    }
  }, [newRow, baseCurrency, updateRate, toast]);

  if (foreignCurrencies.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        <Globe className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p>Add foreign currencies above to start entering exchange rates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add new rate */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Add / Update Rate
        </h4>
        <div className="flex items-end gap-3 flex-wrap">
          <FormField label="From Currency">
            <select
              value={newRow.fromCurrency}
              onChange={(e) => setNewRow((r) => ({ ...r, fromCurrency: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {foreignCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c} — {SUPPORTED_CURRENCIES[c]?.name ?? c}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={`Rate (1 ${newRow.fromCurrency || '???'} = ? ${baseCurrency})`}>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={newRow.rate}
              onChange={(e) => setNewRow((r) => ({ ...r, rate: e.target.value }))}
              placeholder="e.g. 1.0850"
              className="w-36 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
          <FormField label="Effective Date">
            <input
              type="date"
              value={newRow.effectiveDate}
              onChange={(e) => setNewRow((r) => ({ ...r, effectiveDate: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
          <button
            type="button"
            onClick={handleAddRate}
            disabled={updateRate.isPending || !newRow.rate}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {updateRate.isPending ? 'Saving...' : 'Save Rate'}
          </button>
        </div>
      </div>

      {/* Rate history */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">From</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">To</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Effective</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading rates...</td>
              </tr>
            ) : ratesData.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No exchange rates configured yet
                </td>
              </tr>
            ) : (
              ratesData.items.map((rate) => (
                <tr key={rate.id} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                  <td className="px-4 py-2.5 text-foreground font-medium">
                    {rate.fromCurrency}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{rate.toCurrency}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {Number(rate.rate).toFixed(6)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rate.effectiveDate}</td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">
                    {rate.source ?? 'manual'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Unrealized Gain/Loss Preview ────────────────────────────

function UnrealizedGainLossPreview({ baseCurrency }: { baseCurrency: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const { data: report, isLoading } = useUnrealizedGainLoss(asOfDate);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" />
          FX Revaluation Preview
        </h4>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded bg-muted" />
      ) : !report ? (
        <p className="text-sm text-muted-foreground">Select a date to preview unrealized FX gain/loss</p>
      ) : report.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No foreign-currency GL entries found</p>
      ) : (
        <>
          {report.missingRates.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-500">
                Missing rates for: {report.missingRates.join(', ')}. Those accounts cannot be revalued.
              </p>
            </div>
          )}

          <div className="text-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Accounts with foreign exposure:</span>
              <span className="font-medium text-foreground">{report.lines.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Net unrealized gain/loss:</span>
              <span
                className={`font-semibold tabular-nums ${
                  report.totalUnrealizedGainLoss >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {report.totalUnrealizedGainLoss >= 0 ? '+' : ''}
                {report.totalUnrealizedGainLoss.toFixed(2)} {baseCurrency}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main CurrencySettingsTab ────────────────────────────────

export default function CurrencySettingsTab() {
  const { data: currData, isLoading } = useSupportedCurrencies();
  const updateCurrencies = useUpdateSupportedCurrencies();
  const { toast } = useToast();

  const baseCurrency = currData?.baseCurrency ?? 'USD';
  const supported = currData?.supportedCurrencies ?? ['USD'];
  const isMultiCurrency = supported.length > 1;

  const allCurrencies = getSortedCurrencies();
  const availableToAdd = allCurrencies.filter((c) => !supported.includes(c.code));

  const [addingCurrency, setAddingCurrency] = useState('');

  const handleAddCurrency = useCallback(async () => {
    if (!addingCurrency) return;
    const newList = [...supported, addingCurrency];
    try {
      await updateCurrencies.mutateAsync(newList);
      toast.success(`Added ${addingCurrency}`);
      setAddingCurrency('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add currency');
    }
  }, [addingCurrency, supported, updateCurrencies, toast]);

  const handleRemoveCurrency = useCallback(
    async (code: string) => {
      if (code === baseCurrency) return;
      const newList = supported.filter((c) => c !== code);
      try {
        await updateCurrencies.mutateAsync(newList);
        toast.success(`Removed ${code}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove currency');
      }
    },
    [baseCurrency, supported, updateCurrencies, toast],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Base currency info */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <FormField label="Base Currency" helpText="Your primary reporting currency. Change via accounting bootstrap.">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" />
            {baseCurrency} — {SUPPORTED_CURRENCIES[baseCurrency]?.name ?? baseCurrency}
          </div>
        </FormField>
      </div>

      {/* Supported currencies */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supported Currencies
        </h3>
        <p className="text-xs text-muted-foreground">
          Journal entries can be posted in any of these currencies. Foreign amounts are converted to {baseCurrency} at the booked exchange rate.
        </p>

        {/* Active currencies */}
        <div className="flex flex-wrap gap-2">
          {supported.map((code) => {
            const def = SUPPORTED_CURRENCIES[code];
            const isBase = code === baseCurrency;
            return (
              <span
                key={code}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm border ${
                  isBase
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    : 'bg-surface text-foreground border-border'
                }`}
              >
                <span className="font-medium">{code}</span>
                <span className="text-muted-foreground">{def?.symbol}</span>
                {!isBase && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCurrency(code)}
                    disabled={updateCurrencies.isPending}
                    className="ml-1 rounded-full p-0.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                    title={`Remove ${code}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {/* Add currency */}
        {availableToAdd.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={addingCurrency}
              onChange={(e) => setAddingCurrency(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select a currency to add...</option>
              {availableToAdd.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCurrency}
              disabled={!addingCurrency || updateCurrencies.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        )}
      </div>

      {/* Exchange rates (only shown when multi-currency is active) */}
      {isMultiCurrency && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exchange Rates
          </h3>
          <ExchangeRateTable baseCurrency={baseCurrency} supportedCurrencies={supported} />
        </section>
      )}

      {/* FX revaluation preview (only when multi-currency) */}
      {isMultiCurrency && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unrealized FX Gain/Loss
          </h3>
          <UnrealizedGainLossPreview baseCurrency={baseCurrency} />
        </section>
      )}
    </div>
  );
}
