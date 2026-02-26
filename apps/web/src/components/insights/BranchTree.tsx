'use client';

import { useState, useCallback } from 'react';
import { GitBranch, Plus, Trash2, Check, X, MessageSquare } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  label: string;
  parentSessionId: string;
  parentTurnNumber: number;
  branchSessionId: string;
  createdAt: string;
  messageCount: number;
}

interface BranchTreeProps {
  branches: Branch[];
  currentBranchId?: string;
  onSelectBranch: (id: string) => void;
  onCreateBranch: (parentSessionId: string, turnNumber: number, label: string) => void;
  onDeleteBranch?: (id: string) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────

export function BranchTree({
  branches,
  currentBranchId,
  onSelectBranch,
  onCreateBranch,
  onDeleteBranch,
  className,
}: BranchTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newParentSessionId, setNewParentSessionId] = useState('');
  const [newTurnNumber, setNewTurnNumber] = useState(1);

  const handleStartEdit = useCallback((branch: Branch) => {
    setEditingId(branch.id);
    setEditLabel(branch.label);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditLabel('');
  }, []);

  const handleCreate = useCallback(() => {
    if (newLabel.trim() && newParentSessionId.trim()) {
      onCreateBranch(newParentSessionId, newTurnNumber, newLabel.trim());
      setShowCreate(false);
      setNewLabel('');
      setNewParentSessionId('');
      setNewTurnNumber(1);
    }
  }, [onCreateBranch, newLabel, newParentSessionId, newTurnNumber]);

  // Group branches by parent session for tree rendering
  const grouped = new Map<string, Branch[]>();
  for (const b of branches) {
    const existing = grouped.get(b.parentSessionId) ?? [];
    existing.push(b);
    grouped.set(b.parentSessionId, existing);
  }

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Conversation Branches</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-accent/50 rounded-md transition-colors"
        >
          <Plus className="h-3 w-3" />
          Fork
        </button>
      </div>

      {/* Create branch form */}
      {showCreate && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Branch label..."
            maxLength={60}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newParentSessionId}
              onChange={(e) => setNewParentSessionId(e.target.value)}
              placeholder="Parent session ID"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 font-mono"
            />
            <input
              type="number"
              min={1}
              value={newTurnNumber}
              onChange={(e) => setNewTurnNumber(Number(e.target.value))}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              title="Turn number to fork from"
            />
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newLabel.trim() || !newParentSessionId.trim()}
              className="px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Create Branch
            </button>
          </div>
        </div>
      )}

      {/* Branch list */}
      <div className="divide-y divide-border">
        {branches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <GitBranch className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No branches yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fork a conversation to explore different questions
            </p>
          </div>
        )}

        {/* Render main conversations as trunks, branches as leaves */}
        {Array.from(grouped.entries()).map(([parentId, children]) => (
          <div key={parentId} className="py-1">
            {/* Parent label */}
            <div className="px-4 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              From: {parentId.slice(0, 12)}...
            </div>

            {/* Branch items */}
            {children.map((branch) => {
              const isActive = currentBranchId === branch.id;
              const isEditing = editingId === branch.id;

              return (
                <div key={branch.id} className="relative">
                  {/* Connector line */}
                  <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

                  <button
                    type="button"
                    onClick={() => {
                      if (!isEditing) onSelectBranch(branch.id);
                    }}
                    className={`w-full text-left pl-10 pr-4 py-2 transition-colors ${
                      isActive
                        ? 'bg-primary/10'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    {/* Branch connector dot */}
                    <span className={`absolute left-[21px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 ${
                      isActive ? 'border-primary bg-primary' : 'border-border bg-surface'
                    }`} />

                    <div className="flex items-center justify-between">
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                            maxLength={60}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Label editing is local-only for now; parent handles persistence
                              setEditingId(null);
                            }}
                            className="p-0.5 text-primary hover:text-primary/80"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-sm ${isActive ? 'text-primary font-medium' : 'text-foreground'}`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(branch);
                          }}
                        >
                          {branch.label}
                        </span>
                      )}

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {branch.messageCount}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Turn #{branch.parentTurnNumber}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(branch.createdAt)}
                        </span>
                        {onDeleteBranch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBranch(branch.id);
                            }}
                            className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete branch"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
