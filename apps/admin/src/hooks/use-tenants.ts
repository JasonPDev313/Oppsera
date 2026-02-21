'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/api-fetch';

export interface TenantOption {
  id: string;
  name: string;
}

export function useTenants() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminFetch<{ data: TenantOption[] }>('/api/v1/eval/tenants')
      .then((res) => setTenants(res.data))
      .catch(() => setTenants([]))
      .finally(() => setIsLoading(false));
  }, []);

  return { tenants, isLoading };
}
