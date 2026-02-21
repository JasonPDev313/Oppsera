'use client';

import { useState, useEffect, useCallback } from 'react';
import type { POSConfig } from '@/types/pos';
import { useTerminalSession } from '@/components/terminal-session-provider';

const STORAGE_KEY_PREFIX = 'pos_config_';

function getDefaultConfig(locationId: string, mode: 'retail' | 'fnb'): POSConfig {
  if (mode === 'fnb') {
    return {
      posMode: 'fnb',
      terminalId: `terminal_${locationId}_fnb`,
      locationId,
      defaultServiceCharges: [],
      tipEnabled: true,
      receiptMode: 'ask',
      barcodeEnabled: false,
      kitchenSendEnabled: true,
    };
  }

  return {
    posMode: 'retail',
    terminalId: `terminal_${locationId}_retail`,
    locationId,
    defaultServiceCharges: [],
    tipEnabled: false,
    receiptMode: 'ask',
    barcodeEnabled: true,
    kitchenSendEnabled: false,
  };
}

function migrateTerminalId(config: POSConfig): POSConfig {
  // Migrate old _1 suffix to _retail/_fnb
  if (config.terminalId.endsWith('_1')) {
    const suffix = config.posMode === 'fnb' ? '_fnb' : '_retail';
    return { ...config, terminalId: config.terminalId.replace(/_1$/, suffix) };
  }
  return config;
}

function loadConfigFromStorage(locationId: string): POSConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${locationId}`);
    if (!raw) return null;
    const config = migrateTerminalId(JSON.parse(raw) as POSConfig);
    return config;
  } catch {
    return null;
  }
}

function saveConfigToStorage(locationId: string, config: POSConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${locationId}`, JSON.stringify(config));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function usePOSConfig(locationId: string, defaultMode: 'retail' | 'fnb' = 'retail') {
  const { session } = useTerminalSession();

  const [config, setConfigState] = useState<POSConfig | null>(() => {
    const stored = loadConfigFromStorage(locationId);
    if (stored) return { ...stored, locationId };
    const defaults = getDefaultConfig(locationId, defaultMode);
    saveConfigToStorage(locationId, defaults);
    return defaults;
  });
  const [isLoading] = useState(false);

  // Re-load config if locationId changes
  useEffect(() => {
    const stored = loadConfigFromStorage(locationId);
    if (stored) {
      setConfigState({ ...stored, locationId });
    } else {
      const defaults = getDefaultConfig(locationId, defaultMode);
      saveConfigToStorage(locationId, defaults);
      setConfigState(defaults);
    }
  }, [locationId, defaultMode]);

  const setConfig = useCallback(
    (updates: Partial<POSConfig>) => {
      setConfigState((prev) => {
        if (!prev) return prev;
        const next: POSConfig = { ...prev, ...updates, locationId };
        saveConfigToStorage(locationId, next);
        return next;
      });
    },
    [locationId],
  );

  // Override synthetic terminalId/locationId with real session values
  const resolvedConfig = config
    ? {
        ...config,
        terminalId: session?.terminalId ?? config.terminalId,
        locationId: session?.locationId ?? config.locationId,
      }
    : config;

  return { config: resolvedConfig, setConfig, isLoading };
}
