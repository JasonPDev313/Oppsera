'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  dividerBefore?: boolean;
  hidden?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
}

export function ActionMenu({ items }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((item) => !item.hidden);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Click outside + ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, handleClose]);

  // Auto-flip when near viewport bottom
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setFlipUp(spaceBelow < 300);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleItemClick = (item: ActionMenuItem) => {
    if (item.disabled) return;
    handleClose();
    item.onClick();
  };

  if (visibleItems.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        aria-label="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute right-0 z-30 w-56 rounded-lg border border-gray-200 bg-surface py-1 shadow-xl ${
            flipUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {item.dividerBefore && (
                  <div className="my-1 border-t border-gray-100" />
                )}
                <button
                  type="button"
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  title={item.disabled ? item.disabledReason : undefined}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                    item.disabled
                      ? 'cursor-not-allowed text-gray-300'
                      : item.destructive
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
