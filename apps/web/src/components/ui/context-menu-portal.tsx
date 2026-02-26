'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  dividerBefore?: boolean;
  hidden?: boolean;
  children?: ContextMenuItem[];
}

interface ContextMenuPortalProps {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  /** Used internally for submenu offset — do not set manually */
  isSubmenu?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function ContextMenuPortal({
  position,
  items,
  onClose,
  isSubmenu = false,
}: ContextMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [submenuParentKey, setSubmenuParentKey] = useState<string | null>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const visibleItems = items.filter((item) => !item.hidden);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;

    let { x, y } = position;
    if (x + rect.width > innerWidth) x = innerWidth - rect.width - 4;
    if (y + rect.height > innerHeight) y = innerHeight - rect.height - 4;
    if (x < 4) x = 4;
    if (y < 4) y = 4;

    if (x !== position.x || y !== position.y) {
      setAdjustedPosition({ x, y });
    }
  }, [position]);

  // Close on outside mousedown + scroll (only for root menu)
  useEffect(() => {
    if (isSubmenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isSubmenu, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev + 1;
            while (next < visibleItems.length && visibleItems[next]!.disabled) next++;
            return next < visibleItems.length ? next : prev;
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && visibleItems[next]!.disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const item = visibleItems[focusedIndex];
          if (!item || item.disabled) break;
          if (item.children && item.children.length > 0) {
            setSubmenuParentKey(item.key);
          } else if (item.onClick) {
            item.onClick();
            onClose();
          }
          break;
        }
        case 'ArrowRight': {
          const item = visibleItems[focusedIndex];
          if (item?.children && item.children.length > 0) {
            e.preventDefault();
            setSubmenuParentKey(item.key);
          }
          break;
        }
        case 'ArrowLeft': {
          if (isSubmenu) {
            e.preventDefault();
            onClose();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [visibleItems, focusedIndex, isSubmenu, onClose],
  );

  // Auto-focus the menu for keyboard events
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Get submenu position relative to parent item
  const getSubmenuPosition = (parentIndex: number): { x: number; y: number } => {
    const buttons = menuRef.current?.querySelectorAll('[data-menu-item]');
    const parentButton = buttons?.[parentIndex] as HTMLElement | undefined;
    if (!parentButton) return { x: adjustedPosition.x + 200, y: adjustedPosition.y };

    const rect = parentButton.getBoundingClientRect();
    return { x: rect.right, y: rect.top };
  };

  const submenuParentIndex = submenuParentKey
    ? visibleItems.findIndex((i) => i.key === submenuParentKey)
    : -1;
  const submenuItems = submenuParentIndex >= 0 ? visibleItems[submenuParentIndex]!.children : null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-xl outline-none"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {visibleItems.map((item, index) => {
        const Icon = item.icon;
        const hasChildren = item.children && item.children.length > 0;
        const isFocused = index === focusedIndex;

        return (
          <div key={item.key}>
            {item.dividerBefore && (
              <div className="my-1 border-t border-border" />
            )}
            <button
              type="button"
              data-menu-item
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => {
                setFocusedIndex(index);
                if (hasChildren) {
                  setSubmenuParentKey(item.key);
                } else {
                  setSubmenuParentKey(null);
                }
              }}
              onClick={() => {
                if (item.disabled) return;
                if (hasChildren) {
                  setSubmenuParentKey(item.key);
                  return;
                }
                if (item.onClick) {
                  item.onClick();
                  onClose();
                }
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed text-muted-foreground/50'
                  : item.destructive
                    ? `text-red-500 ${isFocused ? 'bg-red-500/10' : 'hover:bg-red-500/10'}`
                    : `text-foreground ${isFocused ? 'bg-accent' : 'hover:bg-accent'}`
              }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="flex-1 text-left">{item.label}</span>
              {hasChildren && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </div>
        );
      })}

      {/* Submenu */}
      {submenuItems && submenuItems.length > 0 && submenuParentIndex >= 0 && (
        <ContextMenuPortal
          position={getSubmenuPosition(submenuParentIndex)}
          items={submenuItems}
          onClose={() => setSubmenuParentKey(null)}
          isSubmenu
        />
      )}
    </div>,
    document.body,
  );
}
