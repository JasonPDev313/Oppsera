'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Called once when the section is first expanded (useful for lazy data fetching) */
  onFirstExpand?: () => void;
  children: React.ReactNode;
}

function getStorageKey(id: string) {
  return `drawer-section-${id}`;
}

export function CollapsibleSection({
  id,
  title,
  badge,
  defaultOpen = true,
  onFirstExpand,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = sessionStorage.getItem(getStorageKey(id));
    return stored !== null ? stored === '1' : defaultOpen;
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const hasExpandedRef = useRef(isOpen);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(getStorageKey(id), next ? '1' : '0');
      if (next && !hasExpandedRef.current) {
        hasExpandedRef.current = true;
        onFirstExpand?.();
      }
      return next;
    });
  }, [id, onFirstExpand]);

  // Sync to sessionStorage on mount if no stored value
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(getStorageKey(id)) === null) {
      sessionStorage.setItem(getStorageKey(id), defaultOpen ? '1' : '0');
    }
  }, [id, defaultOpen]);

  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-gray-50"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      <div
        ref={contentRef}
        className={`grid transition-[grid-template-rows] duration-200 ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
