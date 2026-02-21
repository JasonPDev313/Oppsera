'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Plus,
  Star,
  Loader2,
  Mail,
  Phone,
  ChevronRight,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────

interface Guest {
  id: string;
  propertyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isVip: boolean;
  totalStays: number;
  lastStayDate: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  name: string;
}

// ── Component ────────────────────────────────────────────────────

export default function GuestsContent() {
  const router = useRouter();
  const { user, locations } = useAuthContext();

  // Property selection
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Load properties
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: Property[] }>('/api/v1/pms/properties')
      .then((res) => {
        if (cancelled) return;
        setProperties(res.data);
        if (res.data.length > 0 && !propertyId) {
          setPropertyId(res.data[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load properties');
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
    }, 300);
  }, []);

  // Fetch guests
  const fetchGuests = useCallback(async (append = false) => {
    if (!propertyId) return;
    setIsLoading(true);
    setError(null);

    try {
      const qs = buildQueryString({
        propertyId,
        q: searchTerm || undefined,
        cursor: append ? cursor : undefined,
        limit: 25,
      });

      const res = await apiFetch<{
        data: Guest[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/guests${qs}`);

      if (append) {
        setGuests((prev) => [...prev, ...res.data]);
      } else {
        setGuests(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load guests');
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, searchTerm, cursor]);

  // Re-fetch when property or search term changes
  useEffect(() => {
    if (!propertyId) return;
    setCursor(null);
    setHasMore(false);
    fetchGuests(false);
  }, [propertyId, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchGuests(true);
    }
  }, [hasMore, isLoading, fetchGuests]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">Guests</h1>
        </div>
        <div className="flex items-center gap-2">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => router.push('/pms/guests/new')}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Guest
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full rounded-lg border border-gray-200 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Guests table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="bg-surface">
              <th className="border-b border-gray-200 px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                Name
              </th>
              <th className="border-b border-gray-200 px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                Email
              </th>
              <th className="border-b border-gray-200 px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                Phone
              </th>
              <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-medium text-gray-500">
                VIP
              </th>
              <th className="border-b border-gray-200 px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                Total Stays
              </th>
              <th className="border-b border-gray-200 px-4 py-2.5 text-right text-xs font-medium text-gray-500 w-10">
              </th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && guests.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center text-gray-500">
                    <Users className="h-8 w-8 mb-2 text-gray-300" />
                    <p className="text-sm">
                      {searchTerm ? 'No guests match your search.' : 'No guests found.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {guests.map((g) => (
              <tr
                key={g.id}
                onClick={() => router.push(`/pms/guests/${g.id}`)}
                className="cursor-pointer hover:bg-gray-200/30 transition-colors"
              >
                <td className="border-b border-gray-100 px-4 py-3">
                  <span className="text-sm font-medium text-gray-900">
                    {g.firstName} {g.lastName}
                  </span>
                </td>
                <td className="border-b border-gray-100 px-4 py-3">
                  {g.email ? (
                    <span className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Mail className="h-3 w-3 text-gray-400" />
                      {g.email}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="border-b border-gray-100 px-4 py-3">
                  {g.phone ? (
                    <span className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Phone className="h-3 w-3 text-gray-400" />
                      {g.phone}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="border-b border-gray-100 px-4 py-3 text-center">
                  {g.isVip && (
                    <Star className="mx-auto h-4 w-4 fill-amber-400 text-amber-400" />
                  )}
                </td>
                <td className="border-b border-gray-100 px-4 py-3 text-right">
                  <span className="text-sm text-gray-600">{g.totalStays}</span>
                </td>
                <td className="border-b border-gray-100 px-4 py-3 text-right">
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200/50"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
