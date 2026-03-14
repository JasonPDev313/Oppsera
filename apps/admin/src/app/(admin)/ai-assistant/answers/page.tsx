'use client';

import { useState } from 'react';
import {
  Plus,
  Edit2,
  RefreshCw,
  AlertCircle,
  FileText,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useAnswerCards,
  createAnswerCard,
  updateAnswerCard,
  type AnswerCard,
  type CreateAnswerCardInput,
  type UpdateAnswerCardInput,
} from '@/hooks/use-ai-support';

// ── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-800 text-slate-300 border-slate-600',
    active: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    stale: 'bg-amber-900/50 text-amber-300 border-amber-700',
    archived: 'bg-slate-800 text-slate-500 border-slate-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {status}
    </span>
  );
}

// ── Answer Card Row ──────────────────────────────────────────────

function AnswerCardRow({
  card,
  onUpdated,
}: {
  card: AnswerCard;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateAnswerCardInput>({
    slug: card.slug,
    questionPattern: card.questionPattern,
    approvedAnswerMarkdown: card.approvedAnswerMarkdown,
    moduleKey: card.moduleKey,
    route: card.route,
    status: card.status,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateAnswerCard(card.id, form);
      setEditing(false);
      onUpdated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      {/* Row header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <StatusBadge status={card.status} />
            {card.moduleKey && (
              <span className="text-xs text-indigo-400 bg-indigo-950/50 border border-indigo-800 px-2 py-0.5 rounded-full">
                {card.moduleKey}
              </span>
            )}
            <span className="text-xs text-slate-500">v{card.version}</span>
          </div>
          <p className="text-sm font-semibold text-white font-mono">{card.slug}</p>
          <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{card.questionPattern}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setEditing(true); setExpanded(true); }}
            aria-label="Edit answer card"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded detail / edit form */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-800">
          {editing ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Slug
                  </label>
                  <input
                    value={form.slug ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Status
                  </label>
                  <select
                    value={form.status ?? 'draft'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as AnswerCard['status'],
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="stale">stale</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Module Key
                  </label>
                  <input
                    value={form.moduleKey ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, moduleKey: e.target.value || null }))}
                    placeholder="e.g. catalog"
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Route
                  </label>
                  <input
                    value={form.route ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, route: e.target.value || null }))}
                    placeholder="e.g. /catalog/products"
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Question Pattern
                </label>
                <input
                  value={form.questionPattern ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, questionPattern: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Approved Answer (Markdown)
                </label>
                <textarea
                  value={form.approvedAnswerMarkdown ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, approvedAnswerMarkdown: e.target.value }))
                  }
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 font-mono resize-y focus:outline-none focus:border-indigo-500"
                />
              </div>
              {saveError && (
                <p className="text-sm text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {saveError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
                >
                  <Check size={14} />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setEditing(false); setSaveError(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <span className="font-semibold text-slate-500">Route:</span>{' '}
                  <span className="text-slate-300">{card.route ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Owner:</span>{' '}
                  <span className="text-slate-300 font-mono">{card.ownerUserId ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Updated:</span>{' '}
                  <span className="text-slate-300">
                    {card.updatedAt ? new Date(card.updatedAt).toLocaleString() : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Version:</span>{' '}
                  <span className="text-slate-300">v{card.version}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Question Pattern
                </p>
                <p className="text-sm text-slate-300 italic">{card.questionPattern}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Approved Answer
                </p>
                <div className="bg-slate-950 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                  {card.approvedAnswerMarkdown}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Card Modal ────────────────────────────────────────────

function CreateCardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateAnswerCardInput>({
    slug: '',
    questionPattern: '',
    approvedAnswerMarkdown: '',
    moduleKey: null,
    route: null,
    status: 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleCreate() {
    if (!form.slug.trim() || !form.questionPattern.trim() || !form.approvedAnswerMarkdown.trim()) {
      setSaveError('Slug, question pattern, and approved answer are required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await createAnswerCard(form);
      onCreated();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to create card');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Create Answer Card</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Slug <span className="text-red-400">*</span>
              </label>
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. how-to-add-product"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={form.status ?? 'draft'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as AnswerCard['status'] }))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="stale">stale</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Module Key
              </label>
              <input
                value={form.moduleKey ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, moduleKey: e.target.value || null }))}
                placeholder="e.g. catalog"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Route
              </label>
              <input
                value={form.route ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, route: e.target.value || null }))}
                placeholder="e.g. /catalog/products"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Question Pattern <span className="text-red-400">*</span>
            </label>
            <input
              value={form.questionPattern}
              onChange={(e) => setForm((f) => ({ ...f, questionPattern: e.target.value }))}
              placeholder="e.g. how do I add a product to the catalog?"
              className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Approved Answer (Markdown) <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.approvedAnswerMarkdown}
              onChange={(e) => setForm((f) => ({ ...f, approvedAnswerMarkdown: e.target.value }))}
              rows={10}
              placeholder="Enter the canonical answer in Markdown…"
              className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 font-mono resize-y focus:outline-none focus:border-indigo-500"
            />
          </div>
          {saveError && (
            <p className="text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle size={14} />
              {saveError}
            </p>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
          >
            <Check size={14} />
            {saving ? 'Creating…' : 'Create Card'}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'Stale', value: 'stale' },
  { label: 'Archived', value: 'archived' },
] as const;

export default function AnswerCardsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'active' | 'stale' | 'archived'>('');
  const [showCreate, setShowCreate] = useState(false);

  const { cards, isLoading, error, reload } = useAnswerCards({
    status: statusFilter || undefined,
    limit: 100,
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Answer Cards</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Canonical approved answers used by the AI assistant
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={14} />
            New Card
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {(['active', 'draft', 'stale', 'archived'] as const).map((s) => {
          const count = cards.filter((c) => c.status === s).length;
          const colors: Record<string, string> = {
            active: 'text-emerald-400',
            draft: 'text-slate-300',
            stale: 'text-amber-400',
            archived: 'text-slate-500',
          };
          return (
            <div key={s} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <p className={`text-2xl font-bold ${colors[s]}`}>{count}</p>
              <p className="text-sm text-slate-400 mt-0.5 capitalize">{s}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value as typeof statusFilter)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === value
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-slate-900 border border-slate-700 rounded-lg h-20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && cards.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <FileText size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-lg font-medium">No answer cards</p>
          <p className="text-sm mt-1">
            {statusFilter
              ? `No ${statusFilter} cards found.`
              : 'Create your first answer card to get started.'}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors mx-auto"
          >
            <Plus size={14} />
            Create Answer Card
          </button>
        </div>
      )}

      {/* Cards list */}
      {!isLoading && cards.length > 0 && (
        <div className="space-y-3">
          {cards.map((card) => (
            <AnswerCardRow key={card.id} card={card} onUpdated={reload} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateCardModal
          onClose={() => setShowCreate(false)}
          onCreated={reload}
        />
      )}
    </div>
  );
}
