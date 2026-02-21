'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ───────────────────────────────────────────────────────

interface SectionItem {
  id: string;
  roomId: string;
  roomName: string;
  locationId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  tableCount: number;
}

interface ServerAssignment {
  id: string;
  sectionId: string;
  sectionName: string;
  roomName: string;
  serverUserId: string;
  serverName: string | null;
  businessDate: string;
  status: string;
  assignedAt: string;
  cutAt: string | null;
}

// ── Sections Hook ───────────────────────────────────────────────

interface UseFnbSectionsReturn {
  sections: SectionItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFnbSections(roomId?: string): UseFnbSectionsReturn {
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    try {
      const params = roomId ? `?roomId=${roomId}` : '';
      const json = await apiFetch<{ data: SectionItem[] }>(`/api/v1/fnb/sections${params}`);
      setSections(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  return { sections, isLoading, error, refresh: fetchSections };
}

// ── Server Assignments Hook ─────────────────────────────────────

interface UseFnbAssignmentsReturn {
  assignments: ServerAssignment[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFnbAssignments(businessDate: string): UseFnbAssignmentsReturn {
  const [assignments, setAssignments] = useState<ServerAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      const json = await apiFetch<{ data: ServerAssignment[] }>(`/api/v1/fnb/sections/assignments?businessDate=${businessDate}`);
      setAssignments(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [businessDate]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return { assignments, isLoading, error, refresh: fetchAssignments };
}
