// ── CardPointe Supported Terminal Device Models ─────────────────
// Reference: CardPointe Terminal API documentation

export interface DeviceModelInfo {
  code: string;
  displayName: string;
  manufacturer: string;
  connectionType: 'usb' | 'ip' | 'bluetooth' | 'wifi';
  capabilities: {
    contactless: boolean;
    pin: boolean;
    signature: boolean;
    manualEntry: boolean;
    display: boolean;
    tipPrompt: boolean;
  };
}

export const CARDPOINTE_DEVICE_MODELS: Record<string, DeviceModelInfo> = {
  // Ingenico devices
  ingenico_ipp350: {
    code: 'ingenico_ipp350',
    displayName: 'Ingenico iPP350',
    manufacturer: 'Ingenico',
    connectionType: 'usb',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_ipp320: {
    code: 'ingenico_ipp320',
    displayName: 'Ingenico iPP320',
    manufacturer: 'Ingenico',
    connectionType: 'usb',
    capabilities: {
      contactless: false,
      pin: true,
      signature: false,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_isc_touch_250: {
    code: 'ingenico_isc_touch_250',
    displayName: 'Ingenico iSC Touch 250',
    manufacturer: 'Ingenico',
    connectionType: 'ip',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_ismp4: {
    code: 'ingenico_ismp4',
    displayName: 'Ingenico iSMP4',
    manufacturer: 'Ingenico',
    connectionType: 'bluetooth',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: false,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_lane_3000: {
    code: 'ingenico_lane_3000',
    displayName: 'Ingenico Lane/3000',
    manufacturer: 'Ingenico',
    connectionType: 'usb',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_lane_3600: {
    code: 'ingenico_lane_3600',
    displayName: 'Ingenico Lane/3600',
    manufacturer: 'Ingenico',
    connectionType: 'usb',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_lane_5000: {
    code: 'ingenico_lane_5000',
    displayName: 'Ingenico Lane/5000',
    manufacturer: 'Ingenico',
    connectionType: 'ip',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_lane_7000: {
    code: 'ingenico_lane_7000',
    displayName: 'Ingenico Lane/7000',
    manufacturer: 'Ingenico',
    connectionType: 'ip',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_lane_8000: {
    code: 'ingenico_lane_8000',
    displayName: 'Ingenico Lane/8000',
    manufacturer: 'Ingenico',
    connectionType: 'ip',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  ingenico_link_2500: {
    code: 'ingenico_link_2500',
    displayName: 'Ingenico Link/2500',
    manufacturer: 'Ingenico',
    connectionType: 'wifi',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },

  // Clover devices
  clover_compact: {
    code: 'clover_compact',
    displayName: 'Clover Compact',
    manufacturer: 'Clover',
    connectionType: 'usb',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: false,
      display: false,
      tipPrompt: false,
    },
  },
  clover_flex2: {
    code: 'clover_flex2',
    displayName: 'Clover Flex 2',
    manufacturer: 'Clover',
    connectionType: 'wifi',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  clover_flex3: {
    code: 'clover_flex3',
    displayName: 'Clover Flex 3',
    manufacturer: 'Clover',
    connectionType: 'wifi',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  clover_flex4: {
    code: 'clover_flex4',
    displayName: 'Clover Flex 4',
    manufacturer: 'Clover',
    connectionType: 'wifi',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  clover_flex_pocket: {
    code: 'clover_flex_pocket',
    displayName: 'Clover Flex Pocket',
    manufacturer: 'Clover',
    connectionType: 'wifi',
    capabilities: {
      contactless: true,
      pin: true,
      signature: false,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
  clover_mini: {
    code: 'clover_mini',
    displayName: 'Clover Mini',
    manufacturer: 'Clover',
    connectionType: 'ip',
    capabilities: {
      contactless: true,
      pin: true,
      signature: true,
      manualEntry: true,
      display: true,
      tipPrompt: true,
    },
  },
} as const;

export type DeviceModelCode = keyof typeof CARDPOINTE_DEVICE_MODELS;

/**
 * Get a device model's display name, falling back to the code if unknown.
 */
export function getDeviceDisplayName(code: string | null | undefined): string {
  if (!code) return 'Unknown Device';
  return CARDPOINTE_DEVICE_MODELS[code]?.displayName ?? code;
}

/**
 * Get the list of device models grouped by manufacturer.
 */
export function getDeviceModelsByManufacturer(): Record<string, DeviceModelInfo[]> {
  const grouped: Record<string, DeviceModelInfo[]> = {};
  for (const model of Object.values(CARDPOINTE_DEVICE_MODELS)) {
    if (!grouped[model.manufacturer]) grouped[model.manufacturer] = [];
    grouped[model.manufacturer]!.push(model);
  }
  return grouped;
}
