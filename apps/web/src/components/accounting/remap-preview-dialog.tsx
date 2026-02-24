'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import {
  useRemapPreview,
  useRemapExecute,
} from '@/hooks/use-gl-remap';
import type { RemappableTender } from '@/hooks/use-gl-remap';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface RemapPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  tenders: RemappableTender[];
  onComplete: () => void;
}

export function RemapPreviewDialog({
  open,
  onClose,
  tenders,
  onComplete,
}: RemapPreviewDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select' | 'preview' | 'executing' | 'done'>('select');
  const { preview, data: previews, isLoading: previewLoading, reset: resetPreview } = useRemapPreview();
  const { execute, data: remapResult, reset: resetExecute } = useRemapExecute();

  // Pre-select all remappable tenders
  useEffect(() => {
    if (open) {
      const remappable = tenders.filter(t => t.canRemap).map(t => t.tenderId);
      setSelected(new Set(remappable));
      setStep('select');
      resetPreview();
      resetExecute();
    }
  }, [open, tenders, resetPreview, resetExecute]);

  const handleToggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePreview = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await preview(ids);
    setStep('preview');
  }, [selected, preview]);

  const handleExecute = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setStep('executing');
    try {
      await execute({ tenderIds: ids, reason: 'Retroactive GL remap — mappings now configured' });
      setStep('done');
    } catch {
      setStep('preview');
    }
  }, [selected, execute]);

  const handleDone = useCallback(() => {
    onComplete();
    onClose();
  }, [onComplete, onClose]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl bg-surface shadow-xl mx-4">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-surface px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'select' && 'Preview & Remap GL Entries'}
            {step === 'preview' && 'GL Line Comparison'}
            {step === 'executing' && 'Remapping in Progress...'}
            {step === 'done' && 'Remap Complete'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: Select tenders */}
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select tenders to remap. Only tenders where all missing GL mappings are now configured can be remapped.
              </p>

              <div className="space-y-2">
                {tenders.map((tender) => (
                  <label
                    key={tender.tenderId}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      tender.canRemap
                        ? selected.has(tender.tenderId)
                          ? 'border-indigo-300 bg-indigo-50/50'
                          : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(tender.tenderId)}
                      onChange={() => handleToggle(tender.tenderId)}
                      disabled={!tender.canRemap}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCents(tender.amountCents)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {tender.businessDate}
                        </span>
                        <span className="text-xs text-gray-400 font-mono truncate">
                          {tender.tenderId.slice(0, 12)}...
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tender.missingMappings.map((m, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                              m.nowMapped
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {m.nowMapped ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            {m.entityType}: {m.entityId.length > 12 ? `${m.entityId.slice(0, 12)}...` : m.entityId}
                          </span>
                        ))}
                      </div>
                      {!tender.canRemap && (
                        <p className="mt-1 text-xs text-amber-600">
                          {!tender.glJournalEntryId
                            ? 'No GL entry to remap'
                            : 'Some mappings are still missing'}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={selected.size === 0 || previewLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {previewLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading Preview...
                    </span>
                  ) : (
                    `Preview ${selected.size} Tender${selected.size !== 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview GL line comparison */}
          {step === 'preview' && previews.length > 0 && (
            <div className="space-y-6">
              {previews.map((p) => (
                <div key={p.tenderId} className="rounded-lg border border-gray-200">
                  <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                    <span className="text-sm font-medium text-gray-900">
                      Tender {p.tenderId.slice(0, 12)}...
                    </span>
                    {p.businessDate && (
                      <span className="ml-2 text-xs text-gray-500">{p.businessDate}</span>
                    )}
                    {p.error && (
                      <span className="ml-2 text-xs text-red-600">{p.error}</span>
                    )}
                  </div>

                  {!p.error && p.originalLines && p.projectedLines && (
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      {/* Original */}
                      <div className="p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Current (Fallback)</h4>
                        <div className="space-y-1">
                          {p.originalLines.map((line, i) => (
                            <div
                              key={i}
                              className={`rounded px-2 py-1 text-xs ${
                                line.isFallback ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between">
                                <span className="font-medium">
                                  {line.accountNumber} {line.accountName}
                                </span>
                                <span>
                                  {Number(line.debitAmount) > 0 && `DR $${line.debitAmount}`}
                                  {Number(line.creditAmount) > 0 && `CR $${line.creditAmount}`}
                                </span>
                              </div>
                              {line.isFallback && (
                                <span className="text-amber-600 text-[10px]">Fallback</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Projected */}
                      <div className="p-3">
                        <div className="mb-2 flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <h4 className="text-xs font-semibold uppercase text-gray-500">Projected (Remapped)</h4>
                        </div>
                        <div className="space-y-1">
                          {p.projectedLines.map((line, i) => (
                            <div
                              key={i}
                              className={`rounded px-2 py-1 text-xs ${
                                line.isFallback ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'
                              }`}
                            >
                              <div className="flex justify-between">
                                <span className="font-medium">
                                  {line.accountNumber} {line.accountName}
                                </span>
                                <span>
                                  {Number(line.debitAmount) > 0 && `DR $${line.debitAmount}`}
                                  {Number(line.creditAmount) > 0 && `CR $${line.creditAmount}`}
                                </span>
                              </div>
                              {line.isFallback && (
                                <span className="text-amber-600 text-[10px]">Still Fallback</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleExecute}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Execute Remap ({selected.size} tender{selected.size !== 1 ? 's' : ''})
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Executing */}
          {step === 'executing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="mt-4 text-sm text-gray-600">
                Voiding original entries and reposting with corrected mappings...
              </p>
              <p className="mt-1 text-xs text-gray-400">
                This may take a moment for large batches.
              </p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && remapResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Remap Complete
                  </p>
                  <p className="text-sm text-green-700">
                    {remapResult.summary.success} of {remapResult.summary.total} tenders remapped successfully.
                    {remapResult.summary.failed > 0 && ` ${remapResult.summary.failed} failed.`}
                  </p>
                </div>
              </div>

              {remapResult.results.some(r => !r.success) && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-900">Errors</h4>
                  {remapResult.results.filter(r => !r.success).map((r) => (
                    <div key={r.tenderId} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-mono text-xs">{r.tenderId.slice(0, 12)}...</span>: {r.error}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleDone}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
