'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, AlertTriangle, Star, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveTag {
  id: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  tagIcon: string | null;
  tagType: string;
  tagGroup: string | null;
  priority: number;
  source: string;
  expiresAt: string | null;
}

interface CustomerTagChipsProps {
  customerId: string;
  maxVisible?: number;
  size?: 'xs' | 'sm';
}

// ── Priority helpers ─────────────────────────────────────────────────────────

const GROUP_SORT: Record<string, number> = {
  service_flag: 0,
  value_tier: 1,
  engagement: 2,
  lifecycle: 3,
  behavioral: 4,
  membership: 5,
};

function sortByDisplayPriority(a: ActiveTag, b: ActiveTag): number {
  const ga = GROUP_SORT[a.tagGroup ?? ''] ?? 10;
  const gb = GROUP_SORT[b.tagGroup ?? ''] ?? 10;
  if (ga !== gb) return ga - gb;
  return (a.priority ?? 999) - (b.priority ?? 999);
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
  return TAG_COLORS[color ?? ''] ?? TAG_COLORS.indigo!;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CustomerTagChips({
  customerId,
  maxVisible = 3,
  size = 'xs',
}: CustomerTagChipsProps) {
  const [tags, setTags] = useState<ActiveTag[]>([]);
  const [showAll, setShowAll] = useState(false);

  const fetchTags = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: ActiveTag[] }>(
        `/api/v1/customers/${customerId}/tags/active`,
      );
      setTags(res.data.sort(sortByDisplayPriority));
    } catch {
      // Non-blocking — POS must never fail due to tag fetch
    }
  }, [customerId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  if (tags.length === 0) return null;

  const visible = showAll ? tags : tags.slice(0, maxVisible);
  const overflowCount = tags.length - maxVisible;

  const sizeClasses = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px] gap-0.5'
    : 'px-2 py-0.5 text-xs gap-1';

  const iconSize = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => {
        const colors = getColorClasses(tag.tagColor);
        const isServiceFlag = tag.tagGroup === 'service_flag';

        return (
          <span
            key={tag.id}
            className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses}`}
            title={`${tag.tagName}${tag.source === 'rule' ? ' (auto)' : ''}`}
          >
            {isServiceFlag ? (
              <AlertTriangle className={iconSize} />
            ) : tag.tagGroup === 'value_tier' ? (
              <Star className={iconSize} />
            ) : (
              <Tag className={iconSize} />
            )}
            {tag.tagName}
          </span>
        );
      })}

      {!showAll && overflowCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={`inline-flex items-center rounded-full bg-accent font-medium text-muted-foreground ring-1 ring-inset ring-border ${sizeClasses}`}
        >
          +{overflowCount}
          <ChevronDown className={iconSize} />
        </button>
      )}
    </div>
  );
}
