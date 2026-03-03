'use client';

import type { ReactNode } from 'react';
import { CommandPaletteProvider } from './CommandPaletteProvider';
import { CommandPalette } from './CommandPalette';

export function CommandPaletteWrapper({ children }: { children: ReactNode }) {
  return (
    <CommandPaletteProvider>
      {children}
      <CommandPalette />
    </CommandPaletteProvider>
  );
}
