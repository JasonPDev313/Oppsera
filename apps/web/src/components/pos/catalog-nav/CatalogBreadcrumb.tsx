'use client';

import { memo, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

interface CatalogBreadcrumbProps {
  breadcrumb: Array<{ level: string; id: string; name: string }>;
  onNavigate: (level: string) => void;
}

export const CatalogBreadcrumb = memo(function CatalogBreadcrumb({
  breadcrumb,
  onNavigate,
}: CatalogBreadcrumbProps) {
  const handleNavigate = useCallback(
    (level: string) => {
      onNavigate(level);
    },
    [onNavigate],
  );

  if (breadcrumb.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Inventory breadcrumb">
      {breadcrumb.map((segment, index) => {
        const isLast = index === breadcrumb.length - 1;

        return (
          <span key={`${segment.level}-${segment.id}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            {isLast ? (
              <span className="font-semibold text-foreground" aria-current="location">
                {segment.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate(segment.level)}
                className="text-muted-foreground transition-colors hover:text-indigo-600"
              >
                {segment.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
});
