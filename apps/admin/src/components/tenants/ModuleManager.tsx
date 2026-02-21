'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Layers, AlertTriangle, X, Loader2 } from 'lucide-react';
import { useModuleManager, useModuleTemplates } from '@/hooks/use-module-manager';
import type { AccessMode, EntitlementItem, DependencyCheckResult, ModuleTemplateItem, TemplateDiffItem } from '@/types/tenant';
import { ModuleCard } from './ModuleCard';

const CATEGORY_ORDER = ['core', 'commerce', 'operations', 'finance', 'analytics', 'integrations'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Platform',
  commerce: 'Commerce & POS',
  operations: 'Operations',
  finance: 'Finance & Accounting',
  analytics: 'Analytics & AI',
  integrations: 'Integrations',
};

const MODE_LABELS: Record<AccessMode, string> = {
  off: 'OFF',
  view: 'VIEW',
  full: 'FULL',
};

export function ModuleManager({ tenantId }: { tenantId: string }) {
  const { modules, summary, isLoading, error, load, changeMode, validate, bulkChange } = useModuleManager(tenantId);
  const { templates, load: loadTemplates, preview: previewTemplate } = useModuleTemplates();

  // Dialog state
  const [pendingChange, setPendingChange] = useState<{
    moduleKey: string;
    moduleName: string;
    targetMode: AccessMode;
    check: DependencyCheckResult | null;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{
    template: ModuleTemplateItem;
    changes: TemplateDiffItem[];
  } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  const handleModeChange = useCallback(async (moduleKey: string, targetMode: AccessMode) => {
    setDialogError(null);
    try {
      const check = await validate(moduleKey, targetMode);
      const mod = modules.find((m) => m.moduleKey === moduleKey);
      if (!check.allowed || check.reasonRequired) {
        setPendingChange({ moduleKey, moduleName: mod?.moduleName ?? moduleKey, targetMode, check });
        setReasonText('');
        return;
      }
      await changeMode(moduleKey, targetMode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to change mode';
      setPendingChange(null);
      setDialogError(msg);
    }
  }, [validate, changeMode, modules]);

  const confirmChange = useCallback(async () => {
    if (!pendingChange) return;
    setIsApplying(true);
    setDialogError(null);
    try {
      const autoEnable = (pendingChange.check?.missingDependencies?.length ?? 0) > 0;
      await changeMode(
        pendingChange.moduleKey,
        pendingChange.targetMode,
        reasonText || undefined,
        autoEnable,
      );
      setPendingChange(null);
      setReasonText('');
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed to apply change');
    } finally {
      setIsApplying(false);
    }
  }, [pendingChange, reasonText, changeMode]);

  const handleApplyTemplate = useCallback(async () => {
    if (!templatePreview) return;
    setIsApplying(true);
    setTemplateError(null);
    try {
      const changes = templatePreview.changes
        .filter((c) => c.action !== 'unchanged')
        .map((c) => ({ moduleKey: c.moduleKey, accessMode: c.targetMode }));
      await bulkChange(changes, `Applied template: ${templatePreview.template.name}`, 'template');
      setTemplatePreview(null);
      setShowTemplates(false);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : 'Failed to apply template');
    } finally {
      setIsApplying(false);
    }
  }, [templatePreview, bulkChange]);

  const handleTemplateClick = useCallback(async (t: ModuleTemplateItem) => {
    setIsLoadingPreview(true);
    setTemplateError(null);
    try {
      const result = await previewTemplate(t.id, tenantId);
      setTemplatePreview({ template: t, changes: result.changes });
    } catch {
      setTemplateError('Failed to load template preview');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [previewTemplate, tenantId]);

  const closeTemplateDialog = useCallback(() => {
    setShowTemplates(false);
    setTemplatePreview(null);
    setTemplateError(null);
  }, []);

  const closePendingDialog = useCallback(() => {
    setPendingChange(null);
    setDialogError(null);
  }, []);

  // Group modules by category
  const grouped = new Map<string, EntitlementItem[]>();
  for (const mod of modules) {
    const list = grouped.get(mod.category) ?? [];
    list.push(mod);
    grouped.set(mod.category, list);
  }

  if (isLoading && modules.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">Loading modules...</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm py-4">{error}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Inline error banner (replaces alert()) */}
      {dialogError && !pendingChange && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{dialogError}</p>
          <button onClick={() => setDialogError(null)} className="text-red-400 hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary bar */}
      {summary && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-800 rounded-xl border border-slate-700 px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Shield size={16} className="text-indigo-400" />
            <span className="text-slate-400">Module Access:</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-white font-medium">{summary.fullAccess}</span>
              <span className="text-slate-500">Full</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-white font-medium">{summary.viewOnly}</span>
              <span className="text-slate-500">View</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-white font-medium">{summary.off}</span>
              <span className="text-slate-500">Off</span>
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => { setShowTemplates(true); setTemplateError(null); loadTemplates(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            <Layers size={12} />
            Apply Template
          </button>
        </div>
      )}

      {/* Module groups */}
      {CATEGORY_ORDER.map((cat) => {
        const mods = grouped.get(cat);
        if (!mods || mods.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2 px-1">
              {CATEGORY_LABELS[cat] ?? cat}
            </h3>
            <div className="space-y-1.5">
              {mods.map((mod) => (
                <ModuleCard key={mod.moduleKey} module={mod} onModeChange={handleModeChange} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Dependency / Reason Dialog */}
      {pendingChange && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closePendingDialog} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                Confirm Module Change
              </h3>
              <button onClick={closePendingDialog} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Change context */}
              <p className="text-sm text-slate-300">
                Change <span className="font-medium text-white">{pendingChange.moduleName}</span> to{' '}
                <span className={
                  pendingChange.targetMode === 'full' ? 'font-medium text-emerald-400' :
                  pendingChange.targetMode === 'view' ? 'font-medium text-amber-400' :
                  'font-medium text-red-400'
                }>
                  {MODE_LABELS[pendingChange.targetMode]}
                </span>
              </p>

              {/* Inline error */}
              {dialogError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-400">{dialogError}</p>
                </div>
              )}

              {/* Missing dependencies */}
              {pendingChange.check?.missingDependencies && pendingChange.check.missingDependencies.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-400 font-medium mb-1">Missing Dependencies</p>
                  <p className="text-xs text-slate-300">
                    The following modules will be auto-enabled in VIEW mode:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {pendingChange.check.missingDependencies.map((d) => (
                      <li key={d.key} className="text-xs text-amber-300 font-mono">
                        {d.name} ({d.key})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Active dependents */}
              {pendingChange.check?.dependents && pendingChange.check.dependents.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-400 font-medium mb-1">Cannot Disable</p>
                  <p className="text-xs text-slate-300">
                    The following modules depend on this one and must be disabled first:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {pendingChange.check.dependents.map((d) => (
                      <li key={d.key} className="text-xs text-red-300 font-mono">
                        {d.name} ({d.key}) — currently {d.currentMode}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reason input */}
              {pendingChange.check?.reasonRequired && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Reason required for this change
                  </label>
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter reason for this change..."
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-700">
              <button
                onClick={closePendingDialog}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              {/* Only show confirm if allowed (or has missing deps that can be auto-enabled) */}
              {(pendingChange.check?.allowed || (pendingChange.check?.missingDependencies?.length ?? 0) > 0) &&
                !(pendingChange.check?.dependents && pendingChange.check.dependents.length > 0) && (
                <button
                  onClick={confirmChange}
                  disabled={isApplying || (pendingChange.check?.reasonRequired && !reasonText.trim())}
                  className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40"
                >
                  {isApplying ? 'Applying...' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Template Picker Dialog */}
      {showTemplates && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeTemplateDialog} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white">Apply Module Template</h3>
              <button onClick={closeTemplateDialog} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {/* Inline error */}
              {templateError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-400">{templateError}</p>
                </div>
              )}

              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-500" />
                  <span className="ml-2 text-sm text-slate-500">Loading preview...</span>
                </div>
              ) : templatePreview ? (
                // Preview mode
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTemplatePreview(null)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      &larr; Back
                    </button>
                    <span className="text-sm text-white font-medium">{templatePreview.template.name}</span>
                  </div>
                  {templatePreview.changes.length === 0 ? (
                    <p className="text-xs text-slate-400">No changes — this tenant already matches the template.</p>
                  ) : (
                    <div className="space-y-1">
                      {templatePreview.changes.map((c) => (
                        <div key={c.moduleKey} className="flex items-center gap-2 text-xs px-3 py-2 bg-slate-900 rounded">
                          <span className="text-slate-300 flex-1">{c.moduleName}</span>
                          <span className="text-slate-500">{c.currentMode}</span>
                          <span className="text-slate-600">&rarr;</span>
                          <span className={
                            c.action === 'enable' ? 'text-emerald-400' :
                            c.action === 'disable' ? 'text-red-400' :
                            c.action === 'upgrade' ? 'text-emerald-400' :
                            'text-amber-400'
                          }>
                            {c.targetMode}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : templates.length === 0 ? (
                // Empty state
                <div className="text-center py-8">
                  <Layers size={24} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No templates available</p>
                  <p className="text-xs text-slate-600 mt-1">System templates are created during initial setup.</p>
                </div>
              ) : (
                // Template list
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateClick(t)}
                    className="w-full text-left px-4 py-3 bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{t.name}</span>
                      {t.isSystem && (
                        <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded font-medium">
                          System
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">{t.modules.length} modules</p>
                  </button>
                ))
              )}
            </div>
            {templatePreview && templatePreview.changes.length > 0 && (
              <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-700">
                <button
                  onClick={closeTemplateDialog}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyTemplate}
                  disabled={isApplying}
                  className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40"
                >
                  {isApplying ? 'Applying...' : `Apply ${templatePreview.changes.length} Changes`}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
