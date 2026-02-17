'use client';

import { useState, useCallback } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CustomerAttachmentProps {
  customerId: string | null;
  onAttach: (customerId: string) => void;
  onDetach: () => void;
}

export function CustomerAttachment({
  customerId,
  onAttach,
  onDetach,
}: CustomerAttachmentProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAttach = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAttach(trimmed);
      setInputValue('');
    }
  }, [inputValue, onAttach]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAttach();
      }
    },
    [handleAttach],
  );

  // Customer is attached -- show badge with detach button
  if (customerId) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="indigo" className="gap-1 py-1 pl-2.5 pr-1.5">
          <UserPlus className="h-3 w-3" />
          <span className="max-w-32 truncate">{customerId}</span>
          <button
            type="button"
            onClick={onDetach}
            className="ml-1 rounded-full p-0.5 hover:bg-indigo-200/50 transition-colors"
            aria-label="Detach customer"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      </div>
    );
  }

  // No customer -- show search/input field
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <UserPlus className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Customer ID..."
          className="h-8 w-full rounded-md border border-gray-300 bg-white pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <button
        type="button"
        onClick={handleAttach}
        disabled={!inputValue.trim()}
        className="h-8 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Attach
      </button>
    </div>
  );
}
