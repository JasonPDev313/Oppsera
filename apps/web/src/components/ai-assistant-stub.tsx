'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Sparkles } from 'lucide-react';

export function AiAssistantStub() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Trigger button in top nav */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="AI Assistant"
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {/* Slide-in panel */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-60 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div className="flex w-96 flex-col bg-surface shadow-2xl border-l border-border">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-bold text-foreground">
                  AI Assistant
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close AI Assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Coming Soon body */}
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10"
              >
                <Sparkles className="h-8 w-8 text-indigo-500" />
              </div>
              <p className="mb-1 text-sm font-bold text-foreground">
                Coming Soon
              </p>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Your AI-powered assistant will help you navigate the system, answer questions about
                features, and provide step-by-step guidance — all without leaving your current screen.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
