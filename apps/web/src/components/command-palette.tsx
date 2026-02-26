'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { usePermissionsContext } from '@/components/permissions-provider';
import { navigation, flattenNavigation, type SearchableNavEntry } from '@/lib/navigation';

function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpen]);
}

export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search pages (Ctrl+K)"
      className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block">
        {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318' : 'Ctrl+'}K
      </kbd>
    </button>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { isModuleEnabled } = useEntitlementsContext();
  const { can } = usePermissionsContext();

  const allEntries = useMemo(() => flattenNavigation(navigation), []);

  const filteredEntries = useMemo(() => {
    if (!query.trim()) return allEntries;
    const q = query.toLowerCase().trim();
    return allEntries
      .filter((e) => {
        const searchText = `${e.label} ${e.breadcrumb}`.toLowerCase();
        return searchText.includes(q);
      })
      .sort((a, b) => {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        const aStarts = aLabel.startsWith(q);
        const bStarts = bLabel.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
  }, [query, allEntries]);

  // Filter by module entitlements and permissions
  const visibleEntries = useMemo(
    () =>
      filteredEntries.filter(
        (e) =>
          e.moduleKeys.every((key) => isModuleEnabled(key)) &&
          (!e.requiredPermission || can(e.requiredPermission)),
      ),
    [filteredEntries, isModuleEnabled, can],
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const handleSelect = useCallback(
    (entry: SearchableNavEntry) => {
      handleClose();
      router.push(entry.href);
    },
    [handleClose, router],
  );

  useCommandPaletteShortcut(handleOpen);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, visibleEntries.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (visibleEntries[selectedIndex]) {
            handleSelect(visibleEntries[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    },
    [visibleEntries, selectedIndex, handleSelect, handleClose],
  );

  if (!open) {
    return <CommandPaletteTrigger onClick={handleOpen} />;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={visibleEntries.length > 0}
            aria-controls="command-palette-results"
            aria-activedescendant={visibleEntries[selectedIndex] ? `command-result-${selectedIndex}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages..."
            aria-label="Search pages"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {visibleEntries.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            visibleEntries.map((entry, i) => {
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={entry.href}
                  id={`command-result-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected}
                  onClick={() => handleSelect(entry)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-indigo-500/10 text-indigo-400'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <entry.icon
                    className={`h-4 w-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-muted-foreground'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.label}</div>
                    {entry.breadcrumb && (
                      <div className={`truncate text-xs ${isSelected ? 'text-indigo-400' : 'text-muted-foreground'}`}>
                        {entry.breadcrumb}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">&uarr;</kbd>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">&darr;</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">&crarr;</kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">Esc</kbd>
            Close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
