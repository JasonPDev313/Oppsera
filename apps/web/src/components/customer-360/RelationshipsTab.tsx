'use client';

import { useState } from 'react';
import {
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Star,
  Edit3,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useRelationshipsExtended,
  useRelationshipMutations,
} from '@/hooks/use-customer-360';
import type { RelationshipExtendedEntry } from '@/types/customer-360';

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function relationshipTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusVariant(status: string): string {
  switch (status) {
    case 'active': return 'success';
    case 'inactive': return 'neutral';
    case 'suspended': return 'error';
    default: return 'neutral';
  }
}

// ── Skeleton ─────────────────────────────────────────────────────

function RelationshipSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

// ── Edit Relationship Form ──────────────────────────────────────

function EditRelationshipRow({
  rel,
  customerId,
  onSaved,
  onCancel,
}: {
  rel: RelationshipExtendedEntry;
  customerId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPrimary, setIsPrimary] = useState(rel.isPrimary);
  const [notes, setNotes] = useState(rel.notes ?? '');
  const [effectiveDate, setEffectiveDate] = useState(rel.effectiveDate ?? '');
  const [expirationDate, setExpirationDate] = useState(rel.expirationDate ?? '');
  const { updateRelationship, isLoading } = useRelationshipMutations();

  const handleSave = async () => {
    try {
      await updateRelationship(customerId, rel.id, {
        isPrimary,
        notes: notes.trim() || null,
        effectiveDate: effectiveDate || null,
        expirationDate: expirationDate || null,
      });
      onSaved();
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Edit: {rel.relatedCustomerName}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="rounded border-input text-indigo-600 focus:ring-indigo-500"
          />
          Primary contact
        </label>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Effective Date</label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Expiration Date</label>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}

// ── Relationship Row ────────────────────────────────────────────

function RelationshipRow({
  rel,
  customerId,
  onRefresh,
}: {
  rel: RelationshipExtendedEntry;
  customerId: string;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { removeRelationship, isLoading } = useRelationshipMutations();
  const DirectionIcon = rel.direction === 'parent' ? ArrowUpRight : ArrowDownLeft;

  const handleDelete = async () => {
    try {
      await removeRelationship(customerId, rel.id);
      onRefresh();
    } catch {
      // Error handled in hook
    }
  };

  if (isEditing) {
    return (
      <EditRelationshipRow
        rel={rel}
        customerId={customerId}
        onSaved={() => { setIsEditing(false); onRefresh(); }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-input">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Avatar placeholder */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="min-w-0">
            {/* Name + direction */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {rel.relatedCustomerName}
              </span>
              {rel.isPrimary && (
                <Star className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>

            {/* Badges */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="info">
                {relationshipTypeLabel(rel.relationshipType)}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DirectionIcon className="h-3 w-3" />
                {rel.direction === 'parent' ? 'Parent' : 'Child'}
              </div>
              <Badge variant={statusVariant(rel.relatedCustomerStatus)}>
                {rel.relatedCustomerStatus}
              </Badge>
            </div>

            {/* Dates */}
            {(rel.effectiveDate || rel.expirationDate) && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {rel.effectiveDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    From {formatDate(rel.effectiveDate)}
                  </span>
                )}
                {rel.expirationDate && (
                  <span>Until {formatDate(rel.expirationDate)}</span>
                )}
              </div>
            )}

            {/* Notes */}
            {rel.notes && (
              <p className="mt-1 text-xs text-muted-foreground">{rel.notes}</p>
            )}

            {/* Email */}
            {rel.relatedCustomerEmail && (
              <p className="mt-0.5 text-xs text-muted-foreground">{rel.relatedCustomerEmail}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            title="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLoading}
            className="rounded p-1.5 text-muted-foreground hover:bg-red-500/100/10 hover:text-red-500 disabled:opacity-50"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function RelationshipsTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error, mutate } = useRelationshipsExtended(customerId);

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" />
          Relationships
        </h3>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Content */}
      {isLoading && !data ? (
        <RelationshipSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-sm text-muted-foreground">Failed to load relationships.</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.relationships ?? []).map((rel) => (
            <RelationshipRow
              key={rel.id}
              rel={rel}
              customerId={customerId}
              onRefresh={mutate}
            />
          ))}
          {(data?.relationships ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No relationships found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
