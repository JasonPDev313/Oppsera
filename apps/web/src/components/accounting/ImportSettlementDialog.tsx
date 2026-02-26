'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText } from 'lucide-react';
import type { BankAccount } from '@/types/accounting';

interface ImportSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (processorName: string, csvContent: string, bankAccountId?: string) => Promise<void>;
  bankAccounts: BankAccount[];
  isLoading: boolean;
}

export function ImportSettlementDialog({
  open,
  onClose,
  onImport,
  bankAccounts,
  isLoading,
}: ImportSettlementDialogProps) {
  const [processorName, setProcessorName] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target?.result as string);
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!processorName.trim()) {
      setError('Processor name is required');
      return;
    }
    if (!csvContent.trim()) {
      setError('Please upload a CSV file or paste CSV content');
      return;
    }

    try {
      await onImport(processorName.trim(), csvContent, bankAccountId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }, [processorName, csvContent, bankAccountId, onImport]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Import Settlement</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Processor Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Processor Name
            </label>
            <select
              value={processorName}
              onChange={(e) => setProcessorName(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select or type...</option>
              <option value="Square">Square</option>
              <option value="Stripe">Stripe</option>
              <option value="Clover">Clover</option>
              <option value="Toast">Toast</option>
              <option value="Heartland">Heartland</option>
              <option value="Elavon">Elavon</option>
              <option value="First Data">First Data</option>
              <option value="WorldPay">WorldPay</option>
            </select>
            {!['Square', 'Stripe', 'Clover', 'Toast', 'Heartland', 'Elavon', 'First Data', 'WorldPay'].includes(processorName) && (
              <input
                type="text"
                value={processorName}
                onChange={(e) => setProcessorName(e.target.value)}
                placeholder="Or enter custom name..."
                className="w-full mt-2 rounded-md border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            )}
          </div>

          {/* Bank Account */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Bank Account (optional)
            </label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select bank account...</option>
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.name} {ba.accountNumberLast4 ? `(****${ba.accountNumberLast4})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* CSV Upload */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Settlement CSV
            </label>
            <div className="border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-muted-foreground transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                {fileName ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                    <FileText className="h-5 w-5 text-green-500" />
                    {fileName}
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-1 text-sm text-muted-foreground">
                      Click to upload CSV
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Required columns: date, amount. Optional: fee, net, batch_id, reference
                    </p>
                  </>
                )}
              </label>
            </div>

            {/* Or paste */}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Or paste CSV content
              </summary>
              <textarea
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setFileName('');
                }}
                rows={5}
                placeholder="date,amount,fee,net,batch_id&#10;2026-02-20,100.00,2.90,97.10,BATCH001"
                className="w-full mt-2 rounded-md border border-input px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:ring-indigo-500"
              />
            </details>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-input rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !processorName || !csvContent}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
