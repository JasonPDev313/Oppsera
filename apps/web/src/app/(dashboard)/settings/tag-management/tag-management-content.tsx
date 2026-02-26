'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Tag, Sparkles, Play, Settings2 } from 'lucide-react';
import { useTags, useTagMutations } from '@/hooks/use-tags';
import type { TagListItem } from '@/hooks/use-tags';
import { useSmartTagRules, useSmartTagRuleMutations } from '@/hooks/use-smart-tag-rules';
import type { SmartTagRuleListItem } from '@/hooks/use-smart-tag-rules';
import { useSmartTagRule } from '@/hooks/use-smart-tag-rules';
import { useToast } from '@/components/ui/toast';
import { TagTable } from '@/components/customers/tags/TagTable';
import { CreateTagDialog } from '@/components/customers/tags/CreateTagDialog';
import { EditTagDialog } from '@/components/customers/tags/EditTagDialog';
import { SmartTagRuleBuilder } from '@/components/customers/tags/SmartTagRuleBuilder';

type TabKey = 'all' | 'manual' | 'smart' | 'archived';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'manual', label: 'Manual' },
  { key: 'smart', label: 'Smart' },
  { key: 'archived', label: 'Archived' },
];

export function TagManagementContent() {
  const { toast } = useToast();

  // --- State ---
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TagListItem | null>(null);
  const [ruleBuilderOpen, setRuleBuilderOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);

  // --- Debounced search ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // --- Tag filters based on active tab ---
  const tagOptions = useMemo(() => {
    const opts: {
      tagType?: 'manual' | 'smart';
      includeArchived?: boolean;
      isActive?: boolean;
      search?: string;
    } = {};

    if (activeTab === 'manual') {
      opts.tagType = 'manual';
    } else if (activeTab === 'smart') {
      opts.tagType = 'smart';
    } else if (activeTab === 'archived') {
      opts.includeArchived = true;
      opts.isActive = false;
    }

    if (debouncedSearch) {
      opts.search = debouncedSearch;
    }

    return opts;
  }, [activeTab, debouncedSearch]);

  // --- Data hooks ---
  const { data: tags, isLoading: tagsLoading, mutate: refreshTags } = useTags(tagOptions);
  const { archiveTag, unarchiveTag } = useTagMutations();
  const { data: rules, isLoading: rulesLoading, mutate: refreshRules } = useSmartTagRules();
  const { toggleRule, evaluateRule, isSubmitting: ruleMutating } = useSmartTagRuleMutations();
  const { data: editRuleDetail } = useSmartTagRule(editRuleId);

  // --- Handlers ---
  const handleEdit = useCallback((tag: TagListItem) => {
    setSelectedTag(tag);
    setEditDialogOpen(true);
  }, []);

  const handleArchive = useCallback(async (tag: TagListItem) => {
    try {
      await archiveTag(tag.id);
      toast.success(`Tag "${tag.name}" archived`);
      refreshTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive tag');
    }
  }, [archiveTag, refreshTags, toast]);

  const handleUnarchive = useCallback(async (tag: TagListItem) => {
    try {
      await unarchiveTag(tag.id);
      toast.success(`Tag "${tag.name}" restored`);
      refreshTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore tag');
    }
  }, [unarchiveTag, refreshTags, toast]);

  const handleViewRule = useCallback((_tag: TagListItem) => {
    // Switch to Smart tab and open rule builder for this tag's rule
    setActiveTab('smart');
  }, []);

  const handleTagCreated = useCallback(() => {
    refreshTags();
    refreshRules();
  }, [refreshTags, refreshRules]);

  const handleTagUpdated = useCallback(() => {
    refreshTags();
    refreshRules();
  }, [refreshTags, refreshRules]);

  const handleToggleRule = useCallback(async (rule: SmartTagRuleListItem) => {
    try {
      await toggleRule(rule.id);
      toast.success(`Rule "${rule.name}" ${rule.isActive ? 'deactivated' : 'activated'}`);
      refreshRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  }, [toggleRule, refreshRules, toast]);

  const handleEvaluateRule = useCallback(async (rule: SmartTagRuleListItem) => {
    try {
      const result = await evaluateRule(rule.id);
      if (result) {
        toast.success(
          `Evaluated ${result.customersEvaluated} customers: ${result.tagsApplied} applied, ${result.tagsRemoved} removed (${result.durationMs}ms)`,
        );
      } else {
        toast.success('Evaluation started');
      }
      refreshRules();
      refreshTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to evaluate rule');
    }
  }, [evaluateRule, refreshRules, refreshTags, toast]);

  const handleEditRule = useCallback((rule: SmartTagRuleListItem) => {
    setEditRuleId(rule.id);
    setRuleBuilderOpen(true);
  }, []);

  const handleRuleSaved = useCallback(() => {
    setEditRuleId(null);
    refreshRules();
    refreshTags();
  }, [refreshRules, refreshTags]);

  const handleRuleBuilderClose = useCallback(() => {
    setRuleBuilderOpen(false);
    setEditRuleId(null);
  }, []);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-semibold text-foreground">Tag Management</h1>
        </div>
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" />
          Add Tag
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tags by name..."
          className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* Tag Table */}
      <TagTable
        tags={tags}
        isLoading={tagsLoading}
        onEdit={handleEdit}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onViewRule={handleViewRule}
      />

      {/* Smart Tag Rules Section */}
      {activeTab === 'smart' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <h2 className="text-lg font-semibold text-foreground">Smart Tag Rules</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditRuleId(null);
                setRuleBuilderOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Settings2 className="h-4 w-4" />
              New Rule
            </button>
          </div>

          {rulesLoading ? (
            <RulesSkeleton />
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No smart tag rules yet</p>
              <button
                type="button"
                onClick={() => {
                  setEditRuleId(null);
                  setRuleBuilderOpen(true);
                }}
                className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Rule Name</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tag</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Last Evaluated</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Customers Matched</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((rule) => (
                    <SmartRuleRow
                      key={rule.id}
                      rule={rule}
                      onEdit={handleEditRule}
                      onEvaluate={handleEvaluateRule}
                      onToggle={handleToggleRule}
                      isSubmitting={ruleMutating}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateTagDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleTagCreated}
      />

      <EditTagDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedTag(null);
        }}
        tag={selectedTag}
        onUpdated={handleTagUpdated}
      />

      <SmartTagRuleBuilder
        open={ruleBuilderOpen}
        onClose={handleRuleBuilderClose}
        editRule={editRuleDetail ?? null}
        onSaved={handleRuleSaved}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Smart Rule Row                                                      */
/* ------------------------------------------------------------------ */

function SmartRuleRow({
  rule,
  onEdit,
  onEvaluate,
  onToggle,
  isSubmitting,
}: {
  rule: SmartTagRuleListItem;
  onEdit: (rule: SmartTagRuleListItem) => void;
  onEvaluate: (rule: SmartTagRuleListItem) => void;
  onToggle: (rule: SmartTagRuleListItem) => void;
  isSubmitting: boolean;
}) {
  return (
    <tr className="transition-colors hover:bg-accent/50">
      <td className="px-4 py-3">
        <span className="font-medium text-foreground">{rule.name}</span>
        {rule.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{rule.description}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: rule.tagColor }}
          />
          <span className="text-foreground">{rule.tagName}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={rule.isActive}
          disabled={isSubmitting}
          onClick={() => onToggle(rule)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            rule.isActive ? 'bg-indigo-600' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
              rule.isActive ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {rule.lastEvaluatedAt
          ? new Date(rule.lastEvaluatedAt).toLocaleString()
          : '\u2014'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">
        {rule.customersMatched.toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            disabled={isSubmitting}
            title="Edit rule"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onEvaluate(rule)}
            disabled={isSubmitting}
            title="Evaluate now"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-green-500/10 hover:text-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Rules Skeleton                                                      */
/* ------------------------------------------------------------------ */

function RulesSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 font-medium text-muted-foreground">Rule Name</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Tag</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Last Evaluated</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Customers Matched</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto flex gap-1">
                  <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
                  <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
