'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useCustomerTags } from '@/hooks/use-tags';
import type { CustomerTagEntry } from '@/hooks/use-tags';
import { TagEvidenceTooltip } from './TagEvidenceTooltip';

interface CustomerTagChipsProps {
  customerId: string;
  compact?: boolean;
  maxVisible?: number;
}

function TagChip({
  tag,
  compact,
}: {
  tag: CustomerTagEntry;
  compact: boolean;
}) {
  const isSmart = tag.tagType === 'smart';
  const px = compact ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const textSize = compact ? 'text-xs' : 'text-xs';
  const dotSize = compact ? 'h-2 w-2' : 'h-2.5 w-2.5';

  const chip = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/80 ${px} ${textSize} font-medium text-foreground transition-colors hover:bg-accent/80`}
    >
      <span
        className={`${dotSize} shrink-0 rounded-full`}
        style={{ backgroundColor: tag.tagColor || '#6b7280' }}
      />
      <span className="truncate">{tag.tagName}</span>
      {isSmart && (
        <Sparkles className="h-3 w-3 shrink-0 text-purple-500" />
      )}
    </span>
  );

  if (isSmart && tag.evidence) {
    return (
      <TagEvidenceTooltip evidence={tag.evidence} tagName={tag.tagName}>
        {chip}
      </TagEvidenceTooltip>
    );
  }

  return chip;
}

function ShimmerChip({ compact }: { compact: boolean }) {
  const px = compact ? 'px-2 py-0.5' : 'px-2.5 py-1';
  return (
    <span
      className={`inline-block animate-pulse rounded-full bg-muted/60 ${px}`}
    >
      <span className="invisible text-xs font-medium">Loading tag</span>
    </span>
  );
}

export function CustomerTagChips({
  customerId,
  compact = false,
  maxVisible = 5,
}: CustomerTagChipsProps) {
  const { data: tags, isLoading } = useCustomerTags(customerId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <ShimmerChip compact={compact} />
        <ShimmerChip compact={compact} />
        <ShimmerChip compact={compact} />
      </div>
    );
  }

  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = expanded ? tags : tags.slice(0, maxVisible);
  const hiddenCount = tags.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleTags.map((tag) => (
        <TagChip key={tag.id} tag={tag} compact={compact} />
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`inline-flex items-center rounded-full border border-border/60 bg-muted/80 ${
            compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
          } text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground`}
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={`inline-flex items-center rounded-full border border-border/60 bg-muted/80 ${
            compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
          } text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground`}
        >
          Show less
        </button>
      )}
    </div>
  );
}
