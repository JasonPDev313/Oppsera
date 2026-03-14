'use client';

import { useState, useEffect, useCallback } from 'react';

export type POSDisplaySize = 'default' | 'large' | 'xlarge';

const SCALE_MAP: Record<POSDisplaySize, number> = {
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

const STORAGE_KEY = 'pos_display_size';

export function usePOSDisplaySize() {
  const [displaySize, setDisplaySizeState] = useState<POSDisplaySize>('default');

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'large' || stored === 'xlarge') {
      setDisplaySizeState(stored);
    }
  }, []);

  const setDisplaySize = useCallback((size: POSDisplaySize) => {
    setDisplaySizeState(size);
    localStorage.setItem(STORAGE_KEY, size);
  }, []);

  return {
    displaySize,
    setDisplaySize,
    fontScale: SCALE_MAP[displaySize],
  };
}
