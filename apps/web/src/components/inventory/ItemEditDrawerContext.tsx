'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/** Minimal pre-seed data from POS catalog for instant form rendering */
export interface ItemPreSeed {
  name: string;
  itemType: string;
  categoryId: string | null;
  priceCents: number;
  sku: string | null;
  barcode: string | null;
  isTrackable: boolean;
  metadata: Record<string, unknown>;
  onHand: number | null;
}

interface ItemEditDrawerState {
  isOpen: boolean;
  itemId: string | null;
  initialSection?: string;
  onSaveSuccess?: () => void;
  preSeed?: ItemPreSeed;
  mode?: 'fnb' | 'all';
}

interface OpenOptions {
  section?: string;
  onSaveSuccess?: () => void;
  preSeed?: ItemPreSeed;
  /** When 'fnb', restricts item type dropdown to food/beverage only */
  mode?: 'fnb' | 'all';
}

interface ItemEditDrawerContextType {
  state: ItemEditDrawerState;
  open: (itemId: string, options?: OpenOptions) => void;
  close: () => void;
}

const ItemEditDrawerContext = createContext<ItemEditDrawerContextType | null>(null);

export function ItemEditDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ItemEditDrawerState>({
    isOpen: false,
    itemId: null,
  });

  const open = useCallback(
    (itemId: string, options?: OpenOptions) => {
      setState({
        isOpen: true,
        itemId,
        initialSection: options?.section,
        onSaveSuccess: options?.onSaveSuccess,
        preSeed: options?.preSeed,
        mode: options?.mode,
      });
    },
    [],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, itemId: null }));
  }, []);

  return (
    <ItemEditDrawerContext.Provider value={{ state, open, close }}>
      {children}
    </ItemEditDrawerContext.Provider>
  );
}

export function useItemEditDrawer() {
  const context = useContext(ItemEditDrawerContext);
  if (!context) {
    throw new Error('useItemEditDrawer must be used within ItemEditDrawerProvider');
  }
  return context;
}
