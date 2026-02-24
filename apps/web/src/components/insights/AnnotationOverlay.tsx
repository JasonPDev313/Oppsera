'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Flag, MessageCircle, Milestone, AlertTriangle, X, Plus, Check } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  date: string;
  text: string;
  type: string;
  userId: string;
}

interface AnnotationOverlayProps {
  annotations: Annotation[];
  onAdd: (date: string, text: string) => void;
  onDelete: (id: string) => void;
  chartDates: string[];
  mode: 'view' | 'edit';
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: typeof Flag; color: string; bg: string }> = {
  note: { icon: MessageCircle, color: 'text-blue-500', bg: 'bg-blue-500' },
  flag: { icon: Flag, color: 'text-orange-500', bg: 'bg-orange-500' },
  milestone: { icon: Milestone, color: 'text-violet-500', bg: 'bg-violet-500' },
  alert: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.note!;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ──────────────────────────────────────────────────────

export function AnnotationOverlay({
  annotations,
  onAdd,
  onDelete,
  chartDates,
  mode,
  className,
}: AnnotationOverlayProps) {
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [addingAtDate, setAddingAtDate] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when adding
  useEffect(() => {
    if (addingAtDate && inputRef.current) {
      inputRef.current.focus();
    }
  }, [addingAtDate]);

  // Close popover on click outside
  useEffect(() => {
    function handleClickOutside() {
      setActiveAnnotationId(null);
    }
    if (activeAnnotationId) {
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [activeAnnotationId]);

  const handleAddClick = useCallback((date: string) => {
    setAddingAtDate(date);
    setNewText('');
  }, []);

  const handleAddSubmit = useCallback(() => {
    if (addingAtDate && newText.trim()) {
      onAdd(addingAtDate, newText.trim());
      setAddingAtDate(null);
      setNewText('');
    }
  }, [addingAtDate, newText, onAdd]);

  const handleAddCancel = useCallback(() => {
    setAddingAtDate(null);
    setNewText('');
  }, []);

  // Build a map of date → annotations for quick lookup
  const annotationsByDate = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const existing = annotationsByDate.get(ann.date) ?? [];
    existing.push(ann);
    annotationsByDate.set(ann.date, existing);
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Pin strip along the x-axis */}
      <div className="flex items-end gap-0">
        {chartDates.map((date) => {
          const dateAnnotations = annotationsByDate.get(date) ?? [];
          const isAdding = addingAtDate === date;

          return (
            <div
              key={date}
              className="flex-1 flex flex-col items-center relative"
              style={{ minWidth: 0 }}
            >
              {/* Annotation flags */}
              {dateAnnotations.map((ann) => {
                const cfg = getTypeConfig(ann.type);
                const Icon = cfg.icon;
                const isActive = activeAnnotationId === ann.id;

                return (
                  <div key={ann.id} className="relative mb-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAnnotationId(isActive ? null : ann.id);
                      }}
                      className={`p-0.5 rounded transition-colors ${cfg.color} hover:opacity-80`}
                      title={ann.text}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>

                    {/* Popover */}
                    {isActive && (
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 w-52 rounded-lg border border-border bg-surface shadow-lg p-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${cfg.bg}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-snug">{ann.text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDateShort(ann.date)} &middot; {ann.type}
                            </p>
                          </div>
                          {mode === 'edit' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ann.id);
                                setActiveAnnotationId(null);
                              }}
                              className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                              title="Delete annotation"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add button (edit mode only, shown on hover) */}
              {mode === 'edit' && !isAdding && (
                <button
                  type="button"
                  onClick={() => handleAddClick(date)}
                  className="p-0.5 rounded text-muted-foreground/30 hover:text-primary hover:bg-gray-200/50 transition-colors"
                  title={`Add annotation at ${formatDateShort(date)}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}

              {/* Inline add form */}
              {isAdding && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 w-52 rounded-lg border border-border bg-surface shadow-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {formatDateShort(date)}
                  </p>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSubmit();
                      if (e.key === 'Escape') handleAddCancel();
                    }}
                    placeholder="Add a note..."
                    maxLength={200}
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <div className="flex items-center gap-1 mt-1.5 justify-end">
                    <button
                      type="button"
                      onClick={handleAddCancel}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleAddSubmit}
                      disabled={!newText.trim()}
                      className="p-1 text-primary hover:text-primary/80 disabled:opacity-40 transition-colors"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Date label */}
              <span className="text-[9px] text-muted-foreground/60 mt-0.5 select-none">
                {formatDateShort(date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
