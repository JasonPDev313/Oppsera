'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AdminSession } from '@/lib/auth';

interface AuthState {
  session: AdminSession | null;
  isLoading: boolean;
}

export function useAdminAuth() {
  const [state, setState] = useState<AuthState>({ session: null, isLoading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setState({ session: data?.data?.admin ?? null, isLoading: false }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ session: null, isLoading: false });
      });
    return () => controller.abort();
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }, []);

  return { ...state, logout };
}
