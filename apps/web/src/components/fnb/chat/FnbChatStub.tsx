'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X } from 'lucide-react';

export function FnbChatStub() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          width: 48,
          height: 48,
          backgroundColor: 'var(--fnb-action-send)',
          color: '#fff',
        }}
        title="FOH/BOH Chat"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {/* Panel */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-60 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div
            className="flex flex-col w-80 h-full shadow-2xl"
            style={{
              backgroundColor: 'var(--fnb-bg-surface)',
              borderLeft: 'var(--fnb-border-subtle)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: 'var(--fnb-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" style={{ color: 'var(--fnb-action-send)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  Team Chat
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 transition-colors"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Coming Soon body */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div
                className="flex items-center justify-center rounded-full mb-4"
                style={{
                  width: 64,
                  height: 64,
                  backgroundColor: 'rgba(99,102,241,0.1)',
                }}
              >
                <MessageCircle className="h-8 w-8" style={{ color: 'var(--fnb-action-send)' }} />
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>
                Coming Soon
              </p>
              <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--fnb-text-muted)' }}>
                FOH/BOH messaging will let your team communicate in real time — send alerts, coordinate
                courses, and keep the kitchen in sync without leaving the POS.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
