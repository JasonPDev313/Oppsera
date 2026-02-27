'use client';

import { useState, useMemo } from 'react';
import {
  Tag,
  Users,
  AlertTriangle,
  Star,
  Clock,
  ChevronDown,
  ChevronRight,
  Zap,
  Brain,
  UserCheck,
  Shield,
  X,
} from 'lucide-react';
import { useCustomerTags, useTagMutations } from '@/hooks/use-tags';
import { useTagActionExecutions } from '@/hooks/use-tag-actions';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerSegmentMembership } from '@/types/customers';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProfileTagsTabProps {
  customerId: string;
}

// ── Color mapping ────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  red:     { bg: 'bg-red-500/10',    text: 'text-red-500',    ring: 'ring-red-500/30' },
  amber:   { bg: 'bg-amber-500/10',  text: 'text-amber-500',  ring: 'ring-amber-500/30' },
  yellow:  { bg: 'bg-yellow-500/10', text: 'text-yellow-500', ring: 'ring-yellow-500/30' },
  green:   { bg: 'bg-green-500/10',  text: 'text-green-500',  ring: 'ring-green-500/30' },
  blue:    { bg: 'bg-blue-500/10',   text: 'text-blue-500',   ring: 'ring-blue-500/30' },
  indigo:  { bg: 'bg-indigo-500/10', text: 'text-indigo-500', ring: 'ring-indigo-500/30' },
  purple:  { bg: 'bg-purple-500/10', text: 'text-purple-500', ring: 'ring-purple-500/30' },
  pink:    { bg: 'bg-pink-500/10',   text: 'text-pink-500',   ring: 'ring-pink-500/30' },
  teal:    { bg: 'bg-teal-500/10',   text: 'text-teal-500',   ring: 'ring-teal-500/30' },
};

function getColorClasses(color: string | null) {
  // Try hex-to-name mapping, fallback to indigo
  const name = color?.replace('#', '').toLowerCase();
  if (name && TAG_COLORS[name]) return TAG_COLORS[name]!;
  // Try common hex values
  const HEX_MAP: Record<string, string> = {
    'ef4444': 'red', 'f59e0b': 'amber', 'eab308': 'yellow',
    '22c55e': 'green', '3b82f6': 'blue', '6366f1': 'indigo',
    'a855f7': 'purple', 'ec4899': 'pink', '14b8a6': 'teal',
  };
  const mapped = name ? HEX_MAP[name] : undefined;
  if (mapped && TAG_COLORS[mapped]) return TAG_COLORS[mapped]!;
  return TAG_COLORS.indigo!;
}

// ── Source badges ────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof Tag; color: string }> = {
  manual:     { label: 'Manual',     icon: UserCheck, color: 'text-blue-500' },
  smart:      { label: 'Smart',      icon: Zap,       color: 'text-amber-500' },
  predictive: { label: 'Predicted',  icon: Brain,     color: 'text-purple-500' },
  api:        { label: 'API',        icon: Shield,    color: 'text-teal-500' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getExpiryInfo(expiresAt: string | null): { text: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diffMs = exp - now;
  if (diffMs <= 0) return { text: 'Expired', urgent: true };
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return { text: `${hours}h left`, urgent: true };
  }
  if (days <= 7) return { text: `${days}d left`, urgent: true };
  return { text: `${days}d left`, urgent: false };
}

const _GROUP_LABELS: Record<string, string> = {
  service_flag: 'Service Flags',
  value_tier: 'Value Tier',
  engagement: 'Engagement',
  lifecycle: 'Lifecycle',
  behavioral: 'Behavioral',
  membership: 'Membership',
};

const SEGMENT_TYPE_VARIANTS: Record<string, string> = {
  static: 'neutral',
  dynamic: 'info',
  smart: 'indigo',
  manual: 'neutral',
};

// ── Tag Card ─────────────────────────────────────────────────────────────────

function TagCard({
  tag,
  customerId,
  onRemove,
}: {
  tag: {
    id: string;
    tagId: string;
    tagName: string;
    tagColor: string;
    tagIcon: string | null;
    tagType: string;
    source: string;
    sourceRuleId: string | null;
    evidence: unknown;
    appliedAt: string;
    expiresAt: string | null;
  };
  customerId: string;
  onRemove: (tagId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = getColorClasses(tag.tagColor);
  const srcCfg = SOURCE_CONFIG[tag.source] ?? SOURCE_CONFIG.manual!;
  const SourceIcon = srcCfg.icon;
  const expiry = getExpiryInfo(tag.expiresAt);

  const isServiceFlag = tag.tagType === 'service_flag' || tag.source === 'smart';

  return (
    <div className="rounded-lg border border-border">
      {/* Tag header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Tag chip */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring}`}
        >
          {isServiceFlag ? (
            <AlertTriangle className="h-3 w-3" />
          ) : tag.tagType === 'value_tier' ? (
            <Star className="h-3 w-3" />
          ) : (
            <Tag className="h-3 w-3" />
          )}
          {tag.tagName}
        </span>

        {/* Source badge */}
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${srcCfg.color}`}>
          <SourceIcon className="h-3 w-3" />
          {srcCfg.label}
        </span>

        {/* Expiry countdown */}
        {expiry && (
          <span
            className={`ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium ${
              expiry.urgent ? 'text-amber-500' : 'text-muted-foreground'
            }`}
          >
            <Clock className="h-3 w-3" />
            {expiry.text}
          </span>
        )}

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(tag.tagId)}
          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="Remove tag"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded section: evidence + history */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          <p className="text-[10px] text-muted-foreground">
            Applied {formatDate(tag.appliedAt)}
            {tag.expiresAt && ` · Expires ${formatDate(tag.expiresAt)}`}
          </p>

          {/* Evidence panel for smart/predictive tags */}
          {tag.evidence != null && typeof tag.evidence === 'object' && (
            <EvidencePanel evidence={tag.evidence as Record<string, unknown>} />
          )}

          {/* Action history */}
          {tag.tagId && (
            <ActionHistorySection tagId={tag.tagId} customerId={customerId} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Evidence Panel ───────────────────────────────────────────────────────────

function EvidencePanel({ evidence }: { evidence: Record<string, unknown> }) {
  const conditions = evidence.conditions as Array<{
    metric?: string;
    operator?: string;
    threshold?: number;
    actual?: number;
  }> | undefined;

  if (!conditions || conditions.length === 0) return null;

  return (
    <div className="rounded-md bg-amber-500/5 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
        Evidence
      </p>
      <div className="space-y-1">
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-foreground">
            <span className="font-medium">{c.metric}</span>
            <span className="text-muted-foreground">{c.operator}</span>
            <span className="text-muted-foreground">{c.threshold}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium text-green-500">{c.actual}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action History Section ───────────────────────────────────────────────────

function ActionHistorySection({ tagId, customerId }: { tagId: string; customerId: string }) {
  const { data: executions } = useTagActionExecutions(tagId);

  const filtered = useMemo(
    () => executions.filter((e) => e.customerId === customerId).slice(0, 5),
    [executions, customerId],
  );

  if (filtered.length === 0) return null;

  const STATUS_COLORS: Record<string, string> = {
    success: 'text-green-500',
    failed: 'text-red-500',
    skipped: 'text-muted-foreground',
  };

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Actions
      </p>
      <div className="space-y-1">
        {filtered.map((exec) => (
          <div key={exec.id} className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${STATUS_COLORS[exec.status] ?? 'text-foreground'}`}>
              {exec.status}
            </span>
            <span className="text-muted-foreground">{exec.actionType}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {formatDate(exec.executedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ProfileTagsTab({ customerId }: ProfileTagsTabProps) {
  const { toast } = useToast();
  const { data: customerTags, isLoading, error, mutate } = useCustomerTags(customerId);
  const { removeTag, isSubmitting: _isSubmitting } = useTagMutations();
  const [segments] = useState<CustomerSegmentMembership[]>([]);

  // Group tags by tagType or group
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof customerTags>();
    for (const tag of customerTags) {
      // Use source as a rough group since we don't have tagGroup on CustomerTagEntry
      const key = tag.source === 'smart' ? 'smart' : tag.source === 'predictive' ? 'predictive' : 'manual';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tag);
    }
    return groups;
  }, [customerTags]);

  const handleRemove = async (tagId: string) => {
    try {
      await removeTag(customerId, tagId);
      toast.success('Tag removed');
      mutate();
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading tags..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load tags.</p>
        <button
          type="button"
          onClick={mutate}
          className="mt-2 text-sm font-medium text-indigo-500 hover:text-indigo-400"
        >
          Try again
        </button>
      </div>
    );
  }

  const GROUP_DISPLAY: Record<string, { label: string; icon: typeof Tag }> = {
    manual:     { label: 'Manual Tags',     icon: UserCheck },
    smart:      { label: 'Smart Tags',      icon: Zap },
    predictive: { label: 'Predicted Tags',  icon: Brain },
  };

  return (
    <div className="space-y-6 p-6">
      {/* Tags */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tags ({customerTags.length})
        </h3>

        {customerTags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No tags"
            description="No tags have been applied to this customer."
          />
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([groupKey, groupTags]) => {
              const display = GROUP_DISPLAY[groupKey] ?? { label: groupKey, icon: Tag };
              const GroupIcon = display.icon;
              return (
                <div key={groupKey}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {display.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({groupTags.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {groupTags.map((tag) => (
                      <TagCard
                        key={tag.id}
                        tag={tag}
                        customerId={customerId}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Segments */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Segments
        </h3>
        {segments.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No segments"
            description="This customer is not a member of any segments."
          />
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {segment.segmentName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(segment.addedAt)}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={SEGMENT_TYPE_VARIANTS[segment.segmentType] || 'neutral'}
                >
                  {segment.segmentType}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
