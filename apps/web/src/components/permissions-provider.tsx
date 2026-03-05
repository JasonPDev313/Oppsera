'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface PermissionsContextValue {
  can: (permission: string) => boolean;
  permissions: Set<string>;
  isLoading: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  can: () => false,
  permissions: new Set(),
  isLoading: true,
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { can, permissions, isLoading } = usePermissions();
  const value = useMemo(() => ({ can, permissions, isLoading }), [can, permissions, isLoading]);
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  return useContext(PermissionsContext);
}
