'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, onCancel, isLoading, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || isLoading || disabled) return;
    onSend(msg);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex items-end gap-2 bg-surface-raised border border-gray-200 rounded-2xl px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/30">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Ask a question about your data\u2026'}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none min-h-9 max-h-40 py-1.5 disabled:opacity-50"
      />
      {isLoading ? (
        <button
          onClick={onCancel}
          className="shrink-0 p-2 rounded-xl bg-gray-500 text-white hover:bg-gray-400 transition-colors"
          aria-label="Stop generating"
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="shrink-0 p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
