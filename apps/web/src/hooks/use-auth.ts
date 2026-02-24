'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, ApiError, setTokens, clearTokens, getStoredToken } from '@/lib/api-client';

interface AuthUserProfile {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface LocationProfile {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}

export interface ImpersonationState {
  sessionId: string;
  adminEmail: string;
  adminName: string;
  tenantName: string;
  expiresAt: string;
}

const IMPERSONATION_STORAGE_KEY = 'oppsera_impersonation';

interface MeResponse {
  data: {
    user: AuthUserProfile;
    tenant: TenantProfile | null;
    locations: LocationProfile[];
    membership: { status: string };
    impersonation: { sessionId: string; adminEmail: string } | null;
  };
}

interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

interface SignupResponse {
  data: {
    userId: string;
  };
}

function loadImpersonationFromStorage(): ImpersonationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ImpersonationState;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);

  const retryCount = useRef(0);

  const fetchMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiFetch<MeResponse>('/api/v1/me');
      setUser(response.data.user);
      setTenant(response.data.tenant);
      setLocations(response.data.locations);
      // Hydrate impersonation state from sessionStorage if the server confirms it
      if (response.data.impersonation) {
        const stored = loadImpersonationFromStorage();
        if (stored) setImpersonation(stored);
      }
      retryCount.current = 0;
    } catch (err) {
      // Only clear tokens on actual auth failures (401).
      // Transient server errors (500, network, DB timeout) should NOT log the user out.
      const isAuthFailure = err instanceof ApiError && err.statusCode === 401;

      if (isAuthFailure) {
        setUser(null);
        setTenant(null);
        setLocations([]);
        clearTokens();
      } else if (retryCount.current < 2) {
        // Retry up to 2 times for transient errors (cold start, DB pool exhaustion)
        retryCount.current += 1;
        const delay = retryCount.current * 1500; // 1.5s, 3s
        setTimeout(() => { fetchMe(); }, delay);
        return; // Don't set isLoading false yet — still retrying
      } else {
        // Exhausted retries — clear state but keep tokens so user can refresh
        setUser(null);
        setTenant(null);
        setLocations([]);
        retryCount.current = 0;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string): Promise<{ needsOnboarding: boolean }> => {
    const response = await apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(response.data.accessToken, response.data.refreshToken);

    // Fetch user profile with await-based retry for Vercel cold starts.
    // Unlike fetchMe() (which uses fire-and-forget setTimeout retry and never throws),
    // this inline retry blocks until success or throws on exhaustion — so the login
    // page won't redirect to /dashboard until user state is actually populated.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const meResponse = await apiFetch<MeResponse>('/api/v1/me');
        setUser(meResponse.data.user);
        setTenant(meResponse.data.tenant);
        setLocations(meResponse.data.locations);
        setIsLoading(false);
        // Return onboarding status directly — React state updates are batched
        // and won't be reflected in auth.needsOnboarding until next render.
        return { needsOnboarding: !!meResponse.data.user && !meResponse.data.tenant };
      } catch (err) {
        lastError = err;
        // Auth failure (401) means tokens are bad — don't retry
        if (err instanceof ApiError && err.statusCode === 401) {
          clearTokens();
          throw err;
        }
        // Transient error — wait and retry (1.5s, 3s)
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
        }
      }
    }
    // All retries exhausted — throw so login page shows error instead of redirecting
    throw lastError;
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    await apiFetch<SignupResponse>('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Best effort
    }
    clearTokens();
    sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    setUser(null);
    setTenant(null);
    setLocations([]);
    setImpersonation(null);
  }, []);

  const exitImpersonation = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/impersonate/end', { method: 'POST' });
    } catch {
      // Best effort — session may already be expired
    }
    clearTokens();
    sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    setUser(null);
    setTenant(null);
    setLocations([]);
    setImpersonation(null);
    // Redirect back to admin portal
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';
    window.location.href = adminUrl;
  }, []);

  return {
    user,
    tenant,
    locations,
    login,
    signup,
    logout,
    fetchMe,
    isLoading,
    isAuthenticated: !!user,
    needsOnboarding: !!user && !tenant,
    impersonation,
    isImpersonating: !!impersonation,
    exitImpersonation,
  };
}
