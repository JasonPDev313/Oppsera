'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle,
  X,
  Sparkles,
  Send,
  RotateCcw,
  AlertTriangle,
  StopCircle,
} from 'lucide-react';
import { useAiAssistantChat, type Message } from './useAiAssistantChat';
import { AiAssistantFeedback } from './AiAssistantFeedback';

// ─── Helper: derive a friendly screen name from context ──────────────────────

function deriveScreenName(route: string, moduleKey: string | undefined): string {
  if (moduleKey) {
    const moduleNames: Record<string, string> = {
      orders: 'Orders',
      catalog: 'Catalog',
      inventory: 'Inventory',
      customers: 'Customers',
      accounting: 'Accounting',
      reporting: 'Reports',
      pos: 'Point of Sale',
      settings: 'Settings',
      semantic: 'Insights',
      fnb: 'Food & Beverage',
      kds: 'Kitchen Display',
      marketing: 'Marketing',
      membership: 'Membership',
      spa: 'Spa',
      golf: 'Golf',
      ap: 'Purchasing',
      ar: 'Receivables',
      expenses: 'Expenses',
      'project-costing': 'Projects',
    };
    return moduleNames[moduleKey] ?? moduleKey;
  }
  const segments = route.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last
    ? last.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Dashboard';
}

// ─── Streaming indicator ──────────────────────────────────────────────────────

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label="AI is typing">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
  isLast,
  onFollowup,
}: {
  message: Message;
  isStreaming: boolean;
  isLast: boolean;
  onFollowup: (text: string) => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Simple newline → paragraph rendering (no external markdown lib needed)
  function renderText(text: string) {
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    ));
  }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-surface border border-border text-foreground rounded-bl-sm'
        }`}
      >
        {isAssistant && isLast && isStreaming && message.messageText === '' ? (
          <StreamingDots />
        ) : (
          <>
            {renderText(message.messageText)}
            {isAssistant && isLast && isStreaming && message.messageText !== '' && (
              <span className="ml-1 inline-block">
                <StreamingDots />
              </span>
            )}
          </>
        )}
      </div>

      {/* Low-confidence warning */}
      {isAssistant && message.answerConfidence === 'low' && !isStreaming && (
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Low confidence — please verify this answer</span>
        </div>
      )}

      {/* Feedback (thumbs up/down) — only after streaming, only for real server IDs */}
      {isAssistant && !isStreaming && message.messageText !== '' && !message.id.startsWith('temp-') && (
        <div className="max-w-[85%]">
          <AiAssistantFeedback messageId={message.id} />
        </div>
      )}

      {/* Suggested followups */}
      {isAssistant &&
        !isStreaming &&
        isLast &&
        message.suggestedFollowups &&
        message.suggestedFollowups.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap gap-1.5 pt-0.5">
            {message.suggestedFollowups.map((followup, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowup(followup)}
                className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/20 hover:text-indigo-300"
              >
                {followup}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ screenName }: { screenName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10">
        <Sparkles className="h-7 w-7 text-indigo-500" />
      </div>
      <p className="mb-1 text-sm font-semibold text-foreground">How can I help?</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ask me anything about {screenName}, or how to use any feature in the system.
      </p>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

function AiAssistantPanelInner({ onClose }: { onClose: () => void }) {
  const { messages, isStreaming, error, sendMessage, stopStreaming, resetThread, context } =
    useAiAssistantChat();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const screenName = deriveScreenName(context.route, context.moduleKey);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    setInputValue('');
    void sendMessage(text);
  }, [inputValue, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFollowup = useCallback(
    (text: string) => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  const handleNewChat = useCallback(() => {
    resetThread();
    setInputValue('');
    inputRef.current?.focus();
  }, [resetThread]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-foreground">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="New chat"
            >
              <RotateCcw className="h-3 w-3" />
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close AI Assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Context bar */}
      <div className="shrink-0 border-b border-border bg-surface/50 px-4 py-1.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{screenName}</span>
          {context.moduleKey && (
            <span className="ml-1.5 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
              {context.moduleKey}
            </span>
          )}
        </p>
      </div>

      {/* Message list */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState screenName={screenName} />
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isStreaming}
              isLast={i === messages.length - 1}
              onFollowup={handleFollowup}
            />
          ))
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <div className="flex shrink-0 items-center p-1.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/30"
                title="Stop generating"
                aria-label="Stop generating"
              >
                <StopCircle className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Send message"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}

// ─── Exported panel (with trigger button + portal) ────────────────────────────

export function AiAssistantPanel() {
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

      {/* Slide-in panel via portal */}
      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            className="fixed inset-0 z-60 flex justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={e => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div className="flex h-full w-96 flex-col bg-surface shadow-2xl border-l border-border">
              <AiAssistantPanelInner onClose={() => setIsOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
