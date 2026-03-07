'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileEdit,
  Save,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { useBusinessTypeDetail } from '@/hooks/use-business-type-detail';
import { useCategories } from '@/hooks/use-business-types';
import { ModulesTab } from './modules-tab';
import { AccountingTab } from './accounting-tab';
import { RolesTab } from './roles-tab';
import { PublishModal } from './publish-modal';

type Tab = 'details' | 'modules' | 'accounting' | 'roles' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'modules', label: 'Modules' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'roles', label: 'Roles' },
  { key: 'history', label: 'History' },
];

export default function BusinessTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, error, load, updateMetadata, createDraft } =
    useBusinessTypeDetail(id);
  const { categories, load: loadCategories } = useCategories();
  const [tab, setTab] = useState<Tab>('details');
  const [showPublish, setShowPublish] = useState(false);

  useEffect(() => {
    load();
    loadCategories();
  }, [load, loadCategories]);

  if (isLoading && !detail) {
    return (
      <div className="p-6 text-center text-slate-400">Loading...</div>
    );
  }

  if (error && !detail) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const editableVersionId = detail.draftVersion?.id ?? null;
  const displayVersionId = editableVersionId ?? detail.publishedVersion?.id ?? null;
  const isReadOnly = !editableVersionId;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back */}
      <Link
        href="/business-types"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={16} />
        Back to Business Types
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{detail.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-slate-500 font-mono">{detail.slug}</span>
            {detail.categoryName && (
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">
                {detail.categoryName}
              </span>
            )}
            <span
              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                detail.isActive
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {detail.isActive ? 'Active' : 'Inactive'}
            </span>
            {detail.isSystem && (
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-violet-500/20 text-violet-400">
                System
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editableVersionId && detail.draftVersion && (
            <button
              onClick={() => setShowPublish(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Publish Draft
            </button>
          )}
          {!editableVersionId && (
            <button
              onClick={async () => {
                try {
                  await createDraft();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to create draft');
                }
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <FileEdit size={16} />
              Create Draft
            </button>
          )}
        </div>
      </div>

      {/* Version Banner */}
      <VersionBanner detail={detail} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'details' && (
        <DetailsTab
          detail={detail}
          categories={categories}
          onSave={updateMetadata}
          onLoad={load}
        />
      )}
      {tab === 'modules' && displayVersionId && (
        <ModulesTab
          versionId={displayVersionId}
          isReadOnly={isReadOnly}
        />
      )}
      {tab === 'accounting' && displayVersionId && (
        <AccountingTab versionId={displayVersionId} isReadOnly={isReadOnly} />
      )}
      {tab === 'roles' && displayVersionId && (
        <RolesTab versionId={displayVersionId} isReadOnly={isReadOnly} />
      )}
      {tab === 'history' && (
        <HistoryTab versions={detail.versions} />
      )}

      {/* Publish Modal */}
      {showPublish && detail.draftVersion && (
        <PublishModal
          versionId={detail.draftVersion.id}
          versionNumber={detail.draftVersion.versionNumber}
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function VersionBanner({ detail }: { detail: { publishedVersion: { versionNumber: number } | null; draftVersion: { versionNumber: number } | null } }) {
  const parts: string[] = [];
  if (detail.publishedVersion) parts.push(`Published v${detail.publishedVersion.versionNumber}`);
  else parts.push('No published version');
  if (detail.draftVersion) parts.push(`Draft v${detail.draftVersion.versionNumber} pending`);

  return (
    <div
      className={`rounded-lg px-4 py-2.5 text-sm mb-6 ${
        detail.draftVersion
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
          : detail.publishedVersion
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            : 'bg-slate-700/50 border border-slate-600 text-slate-400'
      }`}
    >
      {parts.join('  ·  ')}
    </div>
  );
}

function DetailsTab({
  detail,
  categories,
  onSave,
  onLoad,
}: {
  detail: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    categoryId: string | null;
    iconKey: string | null;
    isActive: boolean;
    showAtSignup: boolean;
    sortOrder: number;
  };
  categories: { id: string; name: string }[];
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
  onLoad: () => Promise<void>;
}) {
  const [name, setName] = useState(detail.name);
  const [categoryId, setCategoryId] = useState(detail.categoryId ?? '');
  const [description, setDescription] = useState(detail.description ?? '');
  const [iconKey, setIconKey] = useState(detail.iconKey ?? '');
  const [isActive, setIsActive] = useState(detail.isActive);
  const [showAtSignup, setShowAtSignup] = useState(detail.showAtSignup);
  const [sortOrder, setSortOrder] = useState(detail.sortOrder);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync when detail changes (e.g. after load)
  useEffect(() => {
    setName(detail.name);
    setCategoryId(detail.categoryId ?? '');
    setDescription(detail.description ?? '');
    setIconKey(detail.iconKey ?? '');
    setIsActive(detail.isActive);
    setShowAtSignup(detail.showAtSignup);
    setSortOrder(detail.sortOrder);
  }, [detail]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        categoryId: categoryId || undefined,
        description: description.trim() || undefined,
        iconKey: iconKey.trim() || undefined,
        isActive,
        showAtSignup: isActive ? showAtSignup : false,
        sortOrder,
      });
      await onLoad();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const copySlug = () => {
    navigator.clipboard.writeText(detail.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-xs text-slate-500">
        Basic details update immediately and don&apos;t require publishing.
      </p>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Slug (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={detail.slug}
              readOnly
              className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono cursor-not-allowed"
            />
            <button
              onClick={copySlug}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              aria-label="Copy slug"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Category */}
        <div>
          <label htmlFor="edit-cat" className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
          <select
            id="edit-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="edit-desc" className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Icon Key */}
        <div>
          <label htmlFor="edit-icon" className="block text-sm font-medium text-slate-300 mb-1.5">Icon Key</label>
          <input
            id="edit-icon"
            type="text"
            value={iconKey}
            onChange={(e) => setIconKey(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="lucide icon key"
          />
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-700 px-4 py-3">
            <span className="text-sm text-slate-300">Active</span>
            <Toggle checked={isActive} onChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-700 px-4 py-3">
            <span className="text-sm text-slate-300">Show at Signup</span>
            <Toggle
              checked={showAtSignup}
              onChange={setShowAtSignup}
              disabled={!isActive}
            />
          </div>
        </div>

        {/* Sort Order */}
        <div>
          <label htmlFor="edit-sort" className="block text-sm font-medium text-slate-300 mb-1.5">Sort Order</label>
          <input
            id="edit-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            min={0}
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Details
        </button>
      </div>
    </div>
  );
}

function HistoryTab({ versions }: { versions: { id: string; versionNumber: number; status: string; publishedAt: string | null; createdAt: string }[] }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-4 py-3 text-slate-400 font-medium">Version</th>
            <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
            <th className="px-4 py-3 text-slate-400 font-medium">Published</th>
            <th className="px-4 py-3 text-slate-400 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {versions.map((v) => (
            <tr key={v.id} className="hover:bg-slate-700/30">
              <td className="px-4 py-3 text-white font-mono">v{v.versionNumber}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    v.status === 'published'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : v.status === 'draft'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {v.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {new Date(v.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {versions.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                No versions yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-indigo-600' : 'bg-slate-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
