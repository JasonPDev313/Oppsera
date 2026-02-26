'use client';

import { useState, useEffect } from 'react';
import { Layers, Globe, Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

interface Lens {
  slug: string;
  name: string;
  description: string | null;
  domain: string | null;
  isSystem: boolean;
  isActive: boolean;
  tenantId: string | null;
}

// ── LensesContent ──────────────────────────────────────────────────

export default function LensesContent({ embedded }: { embedded?: boolean }) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiFetch<{ data: Lens[] }>('/api/v1/semantic/lenses')
      .then((res) => setLenses(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load lenses'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className={embedded ? '' : 'max-w-4xl mx-auto'}>
      {!embedded && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Layers className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">AI Lenses</h1>
              <p className="text-sm text-muted-foreground">Available AI analysis contexts for your queries</p>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-indigo-500" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {!isLoading && !error && lenses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Layers className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No lenses configured</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Contact your administrator to set up AI analysis lenses for your organization.
          </p>
        </div>
      )}

      {!isLoading && lenses.length > 0 && (
        <div className="space-y-2">
          {lenses.map((lens) => (
            <div
              key={lens.slug}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex-shrink-0">
                {lens.isSystem ? (
                  <Globe className="h-5 w-5 text-indigo-500" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{lens.name}</span>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{lens.slug}</code>
                  {lens.isSystem && (
                    <span className="text-xs bg-indigo-500/20 text-indigo-500 px-1.5 py-0.5 rounded">System</span>
                  )}
                  {!lens.isActive && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                {lens.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{lens.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
