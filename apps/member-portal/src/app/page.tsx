'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface TenantResult {
  id: string;
  name: string;
  slug: string;
}

/**
 * Root page — redirects returning visitors to their last club,
 * or shows a club search for new visitors.
 */
export default function RootPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenantResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(true);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const lastSlug = localStorage.getItem('portal_last_slug');
    if (lastSlug) {
      router.replace(`/${lastSlug}`);
    } else {
      setIsRedirecting(false);
    }
  }, [router]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/v1/tenants/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const json = await res.json();
          setResults(json.data ?? []);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(slug: string) {
    localStorage.setItem('portal_last_slug', slug);
    router.push(`/${slug}/login`);
  }

  if (isRedirecting) return null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Member Portal</h1>
          <p className="text-sm text-[var(--portal-text-muted)]">
            Search for your club to sign in to the member portal.
          </p>
        </div>

        <div className="bg-[var(--portal-surface)] rounded-xl border border-[var(--portal-border)] p-6 shadow-sm">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter club name..."
            autoFocus
            className="w-full rounded-lg border border-[var(--portal-border)] px-3 py-2.5 text-sm
              focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent"
          />

          {isSearching && (
            <p className="text-sm text-[var(--portal-text-muted)] mt-3">Searching...</p>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <p className="text-sm text-[var(--portal-text-muted)] mt-3">
              No clubs found. Check the spelling or contact your club for the correct link.
            </p>
          )}

          {results.length > 0 && (
            <div className="mt-3 space-y-2">
              {results.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => handleSelect(tenant.slug)}
                  className="w-full text-left rounded-lg border border-[var(--portal-border)] px-4 py-3
                    hover:bg-[var(--portal-primary-light)] hover:border-[var(--portal-primary)]
                    transition-colors"
                >
                  <span className="font-medium block">{tenant.name}</span>
                  <span className="text-xs text-[var(--portal-text-muted)]">{tenant.slug}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
