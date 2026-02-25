'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { portalFetch } from '@/lib/api-client';

interface PortalUser {
  customerId: string;
  tenantId: string;
  email: string;
}

export function usePortalAuth() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  const checkSession = useCallback(async () => {
    try {
      const res = await portalFetch<{ data: PortalUser }>('/api/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    await portalFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug }),
    });
    await checkSession();
  }, [tenantSlug, checkSession]);

  const logout = useCallback(async () => {
    await portalFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    if (tenantSlug) {
      router.push(`/${tenantSlug}/login`);
    }
  }, [router, tenantSlug]);

  return { user, isLoading, login, logout, checkSession };
}
