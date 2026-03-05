'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface AssignParty {
  id: string;
  guestName: string;
  partySize: number;
  type: 'waitlist' | 'reservation';
}

interface AssignModeState {
  selectedParty: AssignParty | null;
  assignMode: boolean;
  selectParty: (party: AssignParty) => void;
  cancelAssign: () => void;
}

const AssignModeCtx = createContext<AssignModeState>({
  selectedParty: null,
  assignMode: false,
  selectParty: () => {},
  cancelAssign: () => {},
});

export function AssignModeProvider({ children }: { children: ReactNode }) {
  const [selectedParty, setSelectedParty] = useState<AssignParty | null>(null);

  const selectParty = useCallback((party: AssignParty) => {
    setSelectedParty((prev) => (prev?.id === party.id ? null : party));
  }, []);

  const cancelAssign = useCallback(() => {
    setSelectedParty(null);
  }, []);

  const value = useMemo(() => ({
    selectedParty,
    assignMode: selectedParty !== null,
    selectParty,
    cancelAssign,
  }), [selectedParty, selectParty, cancelAssign]);

  return (
    <AssignModeCtx.Provider value={value}>
      {children}
    </AssignModeCtx.Provider>
  );
}

export function useAssignMode() {
  return useContext(AssignModeCtx);
}
