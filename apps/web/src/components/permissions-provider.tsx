'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface PermissionsContextValue {
  can: (permission: string) => boolean;
  permissions: Set<string>;
  isLoading: boolean;
  hasError: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  can: () => false,
  permissions: new Set(),
  isLoading: true,
  hasError: false,
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { can, permissions, isLoading, hasError } = usePermissions();
  const value = useMemo(() => ({ can, permissions, isLoading, hasError }), [can, permissions, isLoading, hasError]);
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  return useContext(PermissionsContext);
}
