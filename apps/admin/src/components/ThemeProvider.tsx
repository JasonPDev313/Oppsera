'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

function applyTheme(resolved: 'light' | 'dark') {
  const doc = document.documentElement;
  doc.classList.toggle('dark', resolved === 'dark');
  doc.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Sync React state with what the blocking script already applied
  useEffect(() => {
    const stored = localStorage.getItem('admin-theme') as Theme | null;
    const initial = stored ?? 'dark';
    setThemeState(initial);
    const resolved = resolveTheme(initial);
    setResolvedTheme(resolved);
    // Blocking script already set the class, but ensure consistency
    applyTheme(resolved);
  }, []);

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('admin-theme', newTheme);
    const resolved = resolveTheme(newTheme);
    setResolvedTheme(resolved);

    // Enable transition for smooth toggle, then apply
    const doc = document.documentElement;
    doc.classList.add('theme-transition');
    applyTheme(resolved);

    // Remove transition class after animation completes to avoid
    // transitioning colors on every hover/interaction
    const cleanup = setTimeout(() => doc.classList.remove('theme-transition'), 300);
    return () => clearTimeout(cleanup);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
