'use client';

import { useState, useCallback } from 'react';

export type POSDisplaySize = 'default' | 'large' | 'xlarge';

const SCALE_MAP: Record<POSDisplaySize, number> = {
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

const STORAGE_KEY = 'pos_display_size';

export function usePOSDisplaySize() {
  const [displaySize, setDisplaySizeState] = useState<POSDisplaySize>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'large' || stored === 'xlarge') return stored;
    }
    return 'default';
  });

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
