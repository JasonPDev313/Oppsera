'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { useTags, useCustomerTags, useTagMutations } from '@/hooks/use-tags';
import { useToast } from '@/components/ui/toast';

interface AddTagPopoverProps {
  customerId: string;
  onApplied: () => void;
  trigger: React.ReactNode;
}

export function AddTagPopover({
  customerId,
  onApplied,
  trigger,
}: AddTagPopoverProps) {
  const { toast } = useToast();
  const { data: allTags, isLoading: tagsLoading } = useTags({ tagType: 'manual', isActive: true });
  const { data: customerTags } = useCustomerTags(customerId);
  const { applyTag, isSubmitting } = useTagMutations();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Compute position when popover opens
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, []);

  const handleOpen = useCallback(() => {
    setSearch('');
    updatePosition();
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updatePosition]);

  // Filter tags: manual only, not already applied, match search
  const appliedTagIds = useMemo(
    () => new Set(customerTags.map((ct) => ct.tagId)),
    [customerTags],
  );

  const filteredTags = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();
    return allTags.filter((tag) => {
      if (appliedTagIds.has(tag.id)) return false;
      if (lowerSearch && !tag.name.toLowerCase().includes(lowerSearch)) return false;
      return true;
    });
  }, [allTags, appliedTagIds, search]);

  const handleApply = useCallback(
    async (tagId: string) => {
      try {
        await applyTag(customerId, tagId);
        toast.success('Tag applied');
        onApplied();
        handleClose();
      } catch {
        toast.error('Failed to apply tag');
      }
    },
    [customerId, applyTag, toast, onApplied, handleClose],
  );

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="inline-flex cursor-pointer">
        {trigger}
      </div>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-50 w-64 rounded-lg border border-gray-200/80 bg-surface shadow-lg"
            style={{ top: position.top, left: position.left }}
          >
            {/* Search input */}
            <div className="border-b border-gray-200/60 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="w-full rounded-md border border-gray-200 bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Tag list */}
            <div className="max-h-48 overflow-y-auto p-1">
              {tagsLoading && (
                <div className="px-3 py-4 text-center text-xs text-gray-500">
                  Loading tags...
                </div>
              )}

              {!tagsLoading && filteredTags.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-500">
                  {search ? 'No matching tags' : 'No tags available'}
                </div>
              )}

              {filteredTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors hover:bg-gray-100/60"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                    />
                    <span className="truncate text-sm text-gray-700">
                      {tag.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApply(tag.id)}
                    disabled={isSubmitting}
                    className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50/60 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
