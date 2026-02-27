'use client';

import { useState, useCallback } from 'react';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Play, Pause, Clock, CheckCircle, XCircle, AlertTriangle,
  FileText, UserCog, UserPlus, UserMinus, Flag, Bell,
  Wallet, Settings, History,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  useTagActions,
  useTagActionMutations,
  useTagActionExecutions,
} from '@/hooks/use-tag-actions';
import type {
  TagActionItem,
  TagActionType,
  TagActionTrigger,
  TagActionExecutionEntry,
} from '@/hooks/use-tag-actions';
import { ActionConfigForm, ACTION_TYPE_META, TRIGGER_META } from './ActionConfigForm';

// ── Icon resolver ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  FileText, UserCog, UserPlus, UserMinus, Flag, FlagOff: Flag,
  Bell, Wallet, Settings, AlertTriangle,
};

function ActionIcon({ actionType, className }: { actionType: TagActionType; className?: string }) {
  const meta = ACTION_TYPE_META[actionType];
  const Icon = ICON_MAP[meta?.icon ?? ''] ?? FileText;
  return <Icon className={className} />;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TagActionEditorProps {
  tagId: string;
  compact?: boolean;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TagActionEditor({ tagId, compact }: TagActionEditorProps) {
  const { data: actions, isLoading, mutate } = useTagActions(tagId);
  const { createAction, updateAction, deleteAction, reorderActions, isSubmitting } =
    useTagActionMutations(tagId);
  const { toast } = useToast();

  const [addingForTrigger, setAddingForTrigger] = useState<TagActionTrigger | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Group actions by trigger
  const groupedActions: Record<TagActionTrigger, TagActionItem[]> = {
    on_apply: [],
    on_remove: [],
    on_expire: [],
  };
  for (const a of actions) {
    const trigger = a.trigger as TagActionTrigger;
    if (groupedActions[trigger]) groupedActions[trigger].push(a);
  }

  // ── Drag reorder ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(async (trigger: TagActionTrigger) => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const group = [...groupedActions[trigger]];
    const [moved] = group.splice(dragIdx, 1);
    if (!moved) return;
    group.splice(dragOverIdx, 0, moved);
    setDragIdx(null);
    setDragOverIdx(null);
    try {
      await reorderActions(group.map((a) => a.id));
      await mutate();
    } catch (_err) {
      toast.error('Failed to reorder actions');
    }
  }, [dragIdx, dragOverIdx, groupedActions, reorderActions, mutate, toast]);

  // ── CRUD handlers ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async (input: {
    trigger: TagActionTrigger;
    actionType: TagActionType;
    config: Record<string, unknown>;
  }) => {
    try {
      await createAction(input);
      await mutate();
      setAddingForTrigger(null);
      toast.success('Action created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create action');
    }
  }, [createAction, mutate, toast]);

  const handleUpdate = useCallback(async (actionId: string, input: {
    actionType?: TagActionType;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }) => {
    try {
      await updateAction(actionId, input);
      await mutate();
      setEditingId(null);
      toast.success('Action updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update action');
    }
  }, [updateAction, mutate, toast]);

  const handleDelete = useCallback(async (actionId: string) => {
    try {
      await deleteAction(actionId);
      await mutate();
      toast.success('Action deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete action');
    }
  }, [deleteAction, mutate, toast]);

  const handleToggleActive = useCallback(async (action: TagActionItem) => {
    await handleUpdate(action.id, { isActive: !action.isActive });
  }, [handleUpdate]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-4 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">Tag Actions</h4>
            <p className="text-xs text-muted-foreground">
              Actions run automatically when this tag is applied, removed, or expires.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            {showHistory ? 'Hide History' : 'History'}
          </button>
        </div>
      )}

      {/* Trigger groups */}
      {(['on_apply', 'on_remove', 'on_expire'] as const).map((trigger) => (
        <TriggerSection
          key={trigger}
          trigger={trigger}
          actions={groupedActions[trigger]}
          isAdding={addingForTrigger === trigger}
          editingId={editingId}
          dragOverIdx={dragOverIdx}
          isSubmitting={isSubmitting}
          onStartAdd={() => setAddingForTrigger(trigger)}
          onCancelAdd={() => setAddingForTrigger(null)}
          onStartEdit={(id) => setEditingId(id)}
          onCancelEdit={() => setEditingId(null)}
          onCreate={(input) => handleCreate({ ...input, trigger })}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(trigger)}
        />
      ))}

      {actions.length === 0 && !addingForTrigger && (
        <div className="rounded-lg border border-dashed border-border py-6 text-center">
          <Play className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No actions configured</p>
          <p className="text-xs text-muted-foreground">Add actions to automate behavior when this tag is applied or removed.</p>
        </div>
      )}

      {/* Execution History */}
      {showHistory && <ExecutionHistory tagId={tagId} />}
    </div>
  );
}

// ── Trigger Section ──────────────────────────────────────────────────────────

interface TriggerSectionProps {
  trigger: TagActionTrigger;
  actions: TagActionItem[];
  isAdding: boolean;
  editingId: string | null;
  dragOverIdx: number | null;
  isSubmitting: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCreate: (input: { actionType: TagActionType; config: Record<string, unknown> }) => void;
  onUpdate: (id: string, input: { actionType?: TagActionType; config?: Record<string, unknown>; isActive?: boolean }) => void;
  onDelete: (id: string) => void;
  onToggleActive: (action: TagActionItem) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: () => void;
}

function TriggerSection({
  trigger, actions, isAdding, editingId, dragOverIdx, isSubmitting,
  onStartAdd, onCancelAdd, onStartEdit, onCancelEdit,
  onCreate, onUpdate, onDelete, onToggleActive,
  onDragStart, onDragOver, onDrop,
}: TriggerSectionProps) {
  const [expanded, setExpanded] = useState(actions.length > 0);
  const meta = TRIGGER_META[trigger] ?? { label: trigger, description: '' };

  return (
    <div className="rounded-lg border border-border">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{meta.label}</span>
        <span className="text-xs text-muted-foreground">{meta.description}</span>
        {actions.length > 0 && (
          <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-500">
            {actions.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-3 space-y-2">
          {/* Action list */}
          {actions.map((action, idx) => (
            <div
              key={action.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={onDrop}
              onDragEnd={() => { /* cleanup handled in onDrop */ }}
              className={`rounded-lg border transition-colors ${
                dragOverIdx === idx ? 'border-indigo-500 bg-indigo-500/5' : 'border-border/50'
              }`}
            >
              {editingId === action.id ? (
                <ActionEditForm
                  action={action}
                  isSubmitting={isSubmitting}
                  onSave={(input) => onUpdate(action.id, input)}
                  onCancel={onCancelEdit}
                />
              ) : (
                <ActionRow
                  action={action}
                  onEdit={() => onStartEdit(action.id)}
                  onDelete={() => onDelete(action.id)}
                  onToggleActive={() => onToggleActive(action)}
                />
              )}
            </div>
          ))}

          {/* Add form */}
          {isAdding ? (
            <ActionAddForm
              isSubmitting={isSubmitting}
              onSave={onCreate}
              onCancel={onCancelAdd}
            />
          ) : (
            <button
              type="button"
              onClick={onStartAdd}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-indigo-500/50 hover:text-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Action
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Action Row (read mode) ───────────────────────────────────────────────────

function ActionRow({
  action, onEdit, onDelete, onToggleActive,
}: {
  action: TagActionItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const meta = ACTION_TYPE_META[action.actionType];

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />

      <ActionIcon actionType={action.actionType} className="h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{meta.label}</span>
        <ConfigSummary actionType={action.actionType} config={action.config} />
      </div>

      {!action.isActive && (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
          Paused
        </span>
      )}

      <button
        type="button"
        onClick={onToggleActive}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title={action.isActive ? 'Pause' : 'Resume'}
      >
        {action.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Edit"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Config Summary ───────────────────────────────────────────────────────────

function ConfigSummary({ actionType, config }: { actionType: TagActionType; config: Record<string, unknown> }) {
  let summary = '';
  switch (actionType) {
    case 'set_customer_field':
      summary = `${config.field ?? '?'} = ${config.value ?? '?'}`;
      break;
    case 'add_to_segment':
    case 'remove_from_segment':
      summary = `Segment: ${config.segmentId ?? '?'}`;
      break;
    case 'set_service_flag':
    case 'remove_service_flag':
      summary = `Flag: ${config.flagType ?? '?'}`;
      break;
    case 'adjust_wallet':
      summary = `${(config.amountCents as number) > 0 ? '+' : ''}${config.amountCents ?? 0} cents`;
      break;
    case 'set_preference':
      summary = `${config.category ?? 'general'}.${config.key ?? '?'} = ${config.value ?? '?'}`;
      break;
    case 'create_alert':
      summary = `${config.severity ?? 'info'}: ${String(config.message ?? '').slice(0, 40)}`;
      break;
    case 'send_notification':
      summary = config.channel ? `via ${config.channel}` : 'default channel';
      break;
    case 'log_activity':
      summary = config.activityType ? String(config.activityType) : 'default';
      break;
  }

  if (!summary) return null;
  return (
    <p className="truncate text-xs text-muted-foreground">{summary}</p>
  );
}

// ── Action Add Form ──────────────────────────────────────────────────────────

function ActionAddForm({
  isSubmitting, onSave, onCancel,
}: {
  isSubmitting: boolean;
  onSave: (input: { actionType: TagActionType; config: Record<string, unknown> }) => void;
  onCancel: () => void;
}) {
  const [actionType, setActionType] = useState<TagActionType | ''>('');
  const [config, setConfig] = useState<Record<string, unknown>>({});

  const handleSave = () => {
    if (!actionType) return;
    onSave({ actionType, config });
  };

  return (
    <div className="rounded-lg border border-indigo-500/50 bg-indigo-500/5 p-3 space-y-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-foreground">Action Type</label>
        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value as TagActionType); setConfig({}); }}
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Select action type...</option>
          {Object.entries(ACTION_TYPE_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      {actionType && (
        <ActionConfigForm actionType={actionType} config={config} onChange={setConfig} />
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!actionType || isSubmitting}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ── Action Edit Form ─────────────────────────────────────────────────────────

function ActionEditForm({
  action, isSubmitting, onSave, onCancel,
}: {
  action: TagActionItem;
  isSubmitting: boolean;
  onSave: (input: { actionType?: TagActionType; config?: Record<string, unknown> }) => void;
  onCancel: () => void;
}) {
  const [actionType, setActionType] = useState<TagActionType>(action.actionType);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...action.config });

  const handleSave = () => {
    onSave({ actionType, config });
  };

  return (
    <div className="rounded-lg border border-indigo-500/50 bg-indigo-500/5 p-3 space-y-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-foreground">Action Type</label>
        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value as TagActionType); setConfig({}); }}
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          {Object.entries(ACTION_TYPE_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      <ActionConfigForm actionType={actionType} config={config} onChange={setConfig} />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Execution History ────────────────────────────────────────────────────────

function ExecutionHistory({ tagId }: { tagId: string }) {
  const [statusFilter, setStatusFilter] = useState<'success' | 'failed' | 'skipped' | undefined>();
  const { data: executions, isLoading, hasMore, loadMore } = useTagActionExecutions(
    tagId,
    { status: statusFilter },
  );

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'skipped': return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-medium text-foreground">Execution History</h5>
        <div className="flex gap-1">
          {(['all', 'success', 'failed', 'skipped'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s === 'all' ? undefined : s)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                (s === 'all' && !statusFilter) || statusFilter === s
                  ? 'bg-indigo-500/10 text-indigo-500'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="ml-auto h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : executions.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No executions recorded</p>
      ) : (
        <div className="space-y-1">
          {executions.map((exec) => (
            <ExecutionRow key={exec.id} execution={exec} statusIcon={statusIcon} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="w-full py-2 text-xs font-medium text-indigo-500 transition-colors hover:text-indigo-400"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ExecutionRow({
  execution, statusIcon,
}: {
  execution: TagActionExecutionEntry;
  statusIcon: (status: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_TYPE_META[execution.actionType as TagActionType];
  const date = new Date(execution.executedAt);

  return (
    <div className="rounded border border-border/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/30"
      >
        {statusIcon(execution.status)}
        <span className="text-xs font-medium text-foreground">{meta?.label ?? execution.actionType}</span>
        <span className="text-[10px] text-muted-foreground">{execution.trigger}</span>
        {execution.durationMs != null && (
          <span className="text-[10px] text-muted-foreground">{execution.durationMs}ms</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-2.5 py-2 space-y-1">
          <div className="text-[11px]">
            <span className="text-muted-foreground">Customer: </span>
            <span className="font-mono text-foreground">{execution.customerId}</span>
          </div>
          {execution.errorMessage && (
            <div className="text-[11px]">
              <span className="text-red-500">Error: </span>
              <span className="text-foreground">{execution.errorMessage}</span>
            </div>
          )}
          {execution.resultSummary && Object.keys(execution.resultSummary).length > 0 && (
            <div className="text-[11px]">
              <span className="text-muted-foreground">Result: </span>
              <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[10px] text-foreground">
                {JSON.stringify(execution.resultSummary)}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
