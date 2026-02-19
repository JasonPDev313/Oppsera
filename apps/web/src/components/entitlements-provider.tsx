'use client';

import { createContext, useContext } from 'react';
import { useEntitlements } from '@/hooks/use-entitlements';

type EntitlementsContextType = ReturnType<typeof useEntitlements>;

const EntitlementsContext = createContext<EntitlementsContextType | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const entitlements = useEntitlements();
  return <EntitlementsContext.Provider value={entitlements}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlementsContext() {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error('useEntitlementsContext must be used within an EntitlementsProvider');
  }
  return context;
}
