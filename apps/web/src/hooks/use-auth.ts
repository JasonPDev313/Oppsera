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

interface MeResponse {
  data: {
    user: AuthUserProfile;
    tenant: TenantProfile | null;
    locations: LocationProfile[];
    membership: { status: string };
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

export function useAuth() {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const login = useCallback(async (email: string, password: string) => {
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
        return; // Success — login page can now safely redirect
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
    setUser(null);
    setTenant(null);
    setLocations([]);
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
  };
}
