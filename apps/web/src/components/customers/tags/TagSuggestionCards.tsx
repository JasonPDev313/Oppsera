'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { SuggestionMatch } from '@/lib/tag-suggestion-engine';
import { formatConditionPreview } from '@/lib/tag-suggestion-engine';

interface TagSuggestionCardsProps {
  suggestions: SuggestionMatch[];
  onSelect: (match: SuggestionMatch) => void;
  isLoading?: boolean;
}

export function TagSuggestionCards({ suggestions, onSelect, isLoading }: TagSuggestionCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-4 w-12 rounded bg-muted" />
            </div>
            <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Suggested templates</span>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((match) => (
          <SuggestionCard key={match.template.key} match={match} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  match: SuggestionMatch;
  onSelect: (match: SuggestionMatch) => void;
}

function SuggestionCard({ match, onSelect }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { template, score, reason } = match;

  const scorePercent = Math.round(score * 100);

  return (
    <div className="group rounded-lg border border-border bg-surface transition-colors hover:border-indigo-500/50">
      <button
        type="button"
        onClick={() => onSelect(match)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        {/* Color dot */}
        <span
          className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: template.color }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {template.name}
            </span>
            <CategoryBadge category={template.category} />
            {scorePercent > 0 && <ScoreBadge score={scorePercent} />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
            {template.description}
          </p>
          {reason && score > 0 && (
            <p className="mt-0.5 text-xs text-indigo-400">
              {reason}
            </p>
          )}
        </div>

        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      {/* Expandable condition preview */}
      {template.conditions.length > 0 && (
        <div className="border-t border-border/50 px-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex w-full items-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            <span>{expanded ? 'Hide' : 'Show'} conditions ({countConditions(template.conditions)} rules)</span>
          </button>
          {expanded && (
            <div className="space-y-1 pb-2">
              {template.conditions.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && (
                    <div className="my-1 flex items-center gap-2">
                      <span className="h-px flex-1 bg-border/50" />
                      <span className="text-[10px] font-medium text-amber-500">OR</span>
                      <span className="h-px flex-1 bg-border/50" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {group.conditions.map((cond, ci) => (
                      <div key={ci} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {ci > 0 && <span className="text-[10px] font-medium text-blue-400">AND</span>}
                        <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
                          {formatConditionPreview(cond.metric, cond.operator, cond.value)}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    predictive: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
    behavioral: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    lifecycle: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    financial: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${colors[category] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {category}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-500' : score >= 50 ? 'text-amber-500' : 'text-muted-foreground';
  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {score}%
    </span>
  );
}

function countConditions(groups: Array<{ conditions: unknown[] }>): number {
  return groups.reduce((sum, g) => sum + g.conditions.length, 0);
}
