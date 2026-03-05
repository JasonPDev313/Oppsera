'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface ProfileDrawerState {
  isOpen: boolean;
  customerId: string | null;
  initialTab?: string;
  sourceModule?: string;
}

interface ProfileDrawerContextType {
  state: ProfileDrawerState;
  open: (customerId: string, options?: { tab?: string; source?: string }) => void;
  close: () => void;
}

const ProfileDrawerContext = createContext<ProfileDrawerContextType | null>(null);

export function ProfileDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileDrawerState>({
    isOpen: false,
    customerId: null,
  });

  const open = useCallback(
    (customerId: string, options?: { tab?: string; source?: string }) => {
      setState({
        isOpen: true,
        customerId,
        initialTab: options?.tab,
        sourceModule: options?.source,
      });
    },
    [],
  );

  const close = useCallback(() => {
    setState({ isOpen: false, customerId: null });
  }, []);

  const value = useMemo(() => ({ state, open, close }), [state, open, close]);

  return (
    <ProfileDrawerContext.Provider value={value}>
      {children}
    </ProfileDrawerContext.Provider>
  );
}

export function useProfileDrawer() {
  const context = useContext(ProfileDrawerContext);
  if (!context) {
    throw new Error('useProfileDrawer must be used within ProfileDrawerProvider');
  }
  return context;
}
