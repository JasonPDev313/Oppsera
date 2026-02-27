'use client';

import { useState, useRef, useEffect } from 'react';
import { Info, Rocket } from 'lucide-react';
import type { FeatureStory } from './feature-roadmap';
import { getStory, CATEGORY_LABELS } from './feature-roadmap';

/** Compact inline badge — shows story ID with hover tooltip */
export function FeatureBadge({ storyId }: { storyId: string }) {
  const story = getStory(storyId);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Reposition tooltip if clipped
  useEffect(() => {
    if (!show || !tipRef.current) return;
    const rect = tipRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      tipRef.current.style.left = 'auto';
      tipRef.current.style.right = '0';
    }
  }, [show]);

  if (!story) return null;

  const priorityColor =
    story.priority === 'high'
      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      : story.priority === 'medium'
        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
        : 'bg-gray-500/15 text-gray-400 border-gray-500/30';

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-mono font-medium border cursor-help ${priorityColor}`}
        tabIndex={0}
        role="note"
        aria-label={`${story.id}: ${story.title} — ${story.targetPhase}`}
      >
        <Rocket className="h-2.5 w-2.5" />
        {story.id}
      </span>

      {show && (
        <div
          ref={tipRef}
          className="absolute z-50 bottom-full left-0 mb-1.5 w-72 rounded-lg bg-card border border-border shadow-xl p-3 text-left pointer-events-none"
        >
          <div className="flex items-start gap-2 mb-1.5">
            <Rocket className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground leading-tight">
                {story.title}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {story.id}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            {story.description}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[story.category] ?? story.category}
            </span>
            <span className="text-[9px] font-medium text-amber-500">
              {story.targetPhase}
            </span>
          </div>
        </div>
      )}
    </span>
  );
}

/** Block-level placeholder for an entire missing feature section */
export function FeaturePlaceholderBlock({
  storyId,
  compact,
}: {
  storyId: string;
  compact?: boolean;
}) {
  const story = getStory(storyId);
  if (!story) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
        <Rocket className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs text-amber-500 font-medium">{story.title}</span>
        <FeatureBadge storyId={storyId} />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
          <Rocket className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{story.title}</h3>
          <p className="text-[10px] text-muted-foreground font-mono">{story.id}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        {story.description}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground bg-accent rounded-full px-2 py-0.5">
          {CATEGORY_LABELS[story.category] ?? story.category}
        </span>
        <span className="text-[9px] font-medium text-amber-500 bg-amber-500/10 rounded-full px-2 py-0.5">
          {story.targetPhase}
        </span>
      </div>
    </div>
  );
}

/** Group of related feature placeholders for a settings section */
export function FeatureRoadmapGroup({
  stories,
  title,
}: {
  stories: FeatureStory[];
  title?: string;
}) {
  if (stories.length === 0) return null;

  return (
    <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
      {title && (
        <div className="flex items-center gap-1.5 mb-1">
          <Info className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] uppercase tracking-wider font-medium text-amber-500">
            {title}
          </span>
        </div>
      )}
      {stories.map((story) => (
        <div key={story.id} className="flex items-start gap-2 py-1">
          <Rocket className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-foreground font-medium">
                {story.title}
              </span>
              <span className="text-[8px] font-mono text-muted-foreground bg-accent rounded px-1">
                {story.id}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              {story.targetPhase}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
