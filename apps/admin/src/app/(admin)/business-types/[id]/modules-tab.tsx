'use client';

import { useEffect, useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { AlertTriangle, Loader2, Check, X } from 'lucide-react';
import { useModuleDefaults } from '@/hooks/use-business-type-detail';
import type { ModuleRegistryEntry } from '@/hooks/use-business-type-detail';

export interface ModulesTabHandle {
  flush: () => Promise<void>;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Operations',
  commerce: 'Commerce',
  operations: 'Operations',
  finance: 'Finance',
  analytics: 'Analytics',
  integrations: 'Integrations',
};

const CATEGORY_ORDER = ['core', 'commerce', 'operations', 'finance', 'analytics', 'integrations'];

interface ModuleState {
  moduleKey: string;
  isEnabled: boolean;
  accessMode: string;
}

export const ModulesTab = forwardRef<ModulesTabHandle, {
  versionId: string;
  isReadOnly: boolean;
}>(function ModulesTab({ versionId, isReadOnly }, ref) {
  const { defaults, registry, isLoading, error, load, save } =
    useModuleDefaults(versionId);

  const [modules, setModules] = useState<ModuleState[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const dirtyRef = useRef(false);
  const modulesRef = useRef<ModuleState[]>([]);
  modulesRef.current = modules;

  useEffect(() => {
    load();
  }, [load]);

  // Sync local state from loaded defaults + registry (only when not dirty)
  useEffect(() => {
    if (registry.length === 0) return;
    if (dirtyRef.current) return;

    const defaultMap = new Map(defaults.map((d) => [d.moduleKey, d]));
    const states: ModuleState[] = registry.map((entry) => {
      const existing = defaultMap.get(entry.key);
      return {
        moduleKey: entry.key,
        isEnabled: existing?.isEnabled ?? false,
        accessMode: existing?.accessMode ?? 'full',
      };
    });
    setModules(states);
    initialLoadDone.current = true;
  }, [defaults, registry]);

  // Clear debounce timer when becoming read-only or on unmount
  useEffect(() => {
    if (isReadOnly && debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [isReadOnly]);

  // Expose flush() so the parent can force-save before publish
  useImperativeHandle(ref, () => ({
    async flush() {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (dirtyRef.current && !isReadOnly && modulesRef.current.length > 0) {
        setSaveStatus('saving');
        setSaveError(null);
        try {
          await save(modulesRef.current);
          dirtyRef.current = false;
          setSaveStatus('saved');
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to save';
          setSaveError(msg);
          setSaveStatus('error');
          throw e;
        }
      }
    },
  }), [save, isReadOnly]);

  // Auto-save with debounce (only after initial load)
  const doAutoSave = useCallback(() => {
    if (!initialLoadDone.current || isReadOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      setSaveError(null);
      try {
        await save(modulesRef.current);
        dirtyRef.current = false;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save';
        setSaveError(msg);
        setSaveStatus('error');
      }
    }, 800);
  }, [save, isReadOnly]);

  const toggleModule = useCallback(
    (key: string) => {
      dirtyRef.current = true;
      setSaveError(null);
      setSaveStatus('idle');
      setModules((prev) =>
        prev.map((m) =>
          m.moduleKey === key ? { ...m, isEnabled: !m.isEnabled } : m,
        ),
      );
    },
    [],
  );

  const setAccessMode = useCallback(
    (key: string, mode: string) => {
      dirtyRef.current = true;
      setSaveError(null);
      setSaveStatus('idle');
      setModules((prev) =>
        prev.map((m) => (m.moduleKey === key ? { ...m, accessMode: mode } : m)),
      );
    },
    [],
  );

  // Trigger auto-save when modules change (skip initial load)
  const prevModulesRef = useRef<string>('');
  useEffect(() => {
    const serialized = JSON.stringify(modules);
    if (prevModulesRef.current && prevModulesRef.current !== serialized) {
      doAutoSave();
    }
    prevModulesRef.current = serialized;
  }, [modules, doAutoSave]);

  // Group registry by category
  const grouped = useMemo(() => {
    const groups = new Map<string, ModuleRegistryEntry[]>();
    for (const entry of registry) {
      const list = groups.get(entry.category) ?? [];
      list.push(entry);
      groups.set(entry.category, list);
    }
    return groups;
  }, [registry]);

  const enabledSet = useMemo(
    () => new Set(modules.filter((m) => m.isEnabled).map((m) => m.moduleKey)),
    [modules],
  );

  const enabledCount = enabledSet.size;

  // Dependency warnings
  const warnings = useMemo(() => {
    const warns: Record<string, string[]> = {};
    for (const entry of registry) {
      if (!enabledSet.has(entry.key)) continue;
      for (const dep of entry.dependencies) {
        if (!enabledSet.has(dep)) {
          const depEntry = registry.find((r) => r.key === dep);
          const list = warns[entry.key] ?? [];
          list.push(`Requires ${depEntry?.label ?? dep}`);
          warns[entry.key] = list;
        }
      }
    }
    return warns;
  }, [registry, enabledSet]);

  if (isLoading && modules.length === 0) {
    return <div className="text-center text-slate-400 py-12">Loading modules...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm mb-4">
          <X size={14} className="shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button
            onClick={() => { setSaveError(null); setSaveStatus('idle'); }}
            className="text-red-400/60 hover:text-red-400 transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400">
            {enabledCount} enabled
          </span>
          {isReadOnly && (
            <span className="text-xs text-amber-400">
              Read-only — create a new draft to edit
            </span>
          )}
        </div>
        <div className="h-5">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check size={12} />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} />
              Save failed
            </span>
          )}
        </div>
      </div>

      {/* Module Groups */}
      <div className="space-y-6">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
          const entries = grouped.get(cat)!;
          return (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700/50">
                {entries.map((entry) => {
                  const mod = modules.find((m) => m.moduleKey === entry.key);
                  const isEnabled = mod?.isEnabled ?? false;
                  const accessMode = mod?.accessMode ?? 'full';
                  const depWarnings = warnings[entry.key];

                  return (
                    <div
                      key={entry.key}
                      className={`px-4 py-3 flex items-center gap-4 ${
                        isEnabled ? '' : 'opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleModule(entry.key)}
                          disabled={isReadOnly}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                        />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-white">
                            {entry.label}
                          </span>
                          <p className="text-xs text-slate-500 truncate">
                            {entry.description}
                          </p>
                        </div>
                      </label>

                      {/* Dependency warnings */}
                      {depWarnings && isEnabled && (
                        <div className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle size={14} />
                          <span className="text-xs">{depWarnings.join(', ')}</span>
                        </div>
                      )}

                      {/* Access Mode selector */}
                      {isEnabled && entry.accessModes.length > 1 && (
                        <div className="flex gap-1">
                          {entry.accessModes
                            .filter((m) => m !== 'off')
                            .map((mode) => (
                              <button
                                key={mode}
                                onClick={() => setAccessMode(entry.key, mode)}
                                disabled={isReadOnly}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                  accessMode === mode
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:text-white'
                                } ${isReadOnly ? 'cursor-not-allowed' : ''}`}
                              >
                                {mode === 'full' ? 'Full' : 'View'}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
