'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageCircle,
  X,
  Sparkles,
  Send,
  RotateCcw,
  AlertTriangle,
  StopCircle,
  UserRound,
  Loader2,
  Clock,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { useAiAssistantChat, type Message } from './useAiAssistantChat';
import { AiAssistantFeedback } from './AiAssistantFeedback';
import { usePermissions } from '@/hooks/use-permissions';
import { useFetch } from '@/hooks/use-fetch';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThreadSummary {
  id: string;
  status: string;
  summary: string | null;
  moduleKey: string | null;
  currentRoute: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

// ─── Helper: derive a friendly screen name from context ──────────────────────

const MODULE_NAMES: Record<string, string> = {
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

function deriveScreenName(route: string, moduleKey: string | undefined): string {
  if (moduleKey) {
    return MODULE_NAMES[moduleKey] ?? moduleKey;
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

// ─── Followup section stripper ────────────────────────────────────────────────

function stripFollowupSection(text: string): string {
  const separatorIdx = text.lastIndexOf('\n---');
  if (separatorIdx === -1) return text;

  const afterSep = text.slice(separatorIdx + 4);
  const lines = afterSep.split('\n');

  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length === 0) return text;
  const allBullets = nonEmpty.every(l => /^[-*]\s+/.test(l.trim()));
  if (!allBullets) return text;

  return text.slice(0, separatorIdx).trimEnd();
}

// ─── Relative time formatter ─────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'Just now'; // Future timestamps (clock skew)
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

  function renderText(text: string) {
    const cleaned = isAssistant ? stripFollowupSection(text) : text;

    if (isAssistant) {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>,
            li: ({ children }) => <li className="mb-0.5">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-');
              if (isBlock) {
                return (
                  <code className="block my-2 rounded-lg bg-black/20 px-3 py-2 text-xs font-mono overflow-x-auto">
                    {children}
                  </code>
                );
              }
              return (
                <code className="rounded bg-black/20 px-1 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <pre className="my-0">{children}</pre>,
            h1: ({ children }) => <p className="mb-2 font-bold last:mb-0">{children}</p>,
            h2: ({ children }) => <p className="mb-2 font-bold last:mb-0">{children}</p>,
            h3: ({ children }) => <p className="mb-1.5 font-semibold last:mb-0">{children}</p>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline hover:text-indigo-300">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-2 border-indigo-500/40 pl-3 text-muted-foreground">
                {children}
              </blockquote>
            ),
          }}
        >
          {cleaned}
        </ReactMarkdown>
      );
    }

    return cleaned.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < cleaned.split('\n').length - 1 && <br />}
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

      {isAssistant && message.activeAction && message.activeAction.status === 'executing' && (
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-400">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span>Looking up {message.activeAction.name.replace(/_/g, ' ')}...</span>
        </div>
      )}

      {isAssistant && message.answerConfidence === 'low' && !isStreaming && (
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Low confidence — please verify this answer</span>
        </div>
      )}

      {message.role === 'system' && (
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
          <UserRound className="h-3 w-3 shrink-0" />
          <span>{message.messageText}</span>
        </div>
      )}

      {isAssistant && !isStreaming && message.messageText !== '' && !message.id.startsWith('temp-') && (
        <div className="max-w-[85%]">
          <AiAssistantFeedback messageId={message.id} />
        </div>
      )}

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

// ─── Thread history list ──────────────────────────────────────────────────────

function ThreadHistoryList({
  onResume,
  onBack,
}: {
  onResume: (threadId: string) => void;
  onBack: () => void;
}) {
  const { data, isLoading } = useFetch<{
    data: ThreadSummary[];
    meta: { cursor: string | null; hasMore: boolean };
  }>('/api/v1/ai-support/threads?limit=50');

  const threads = data?.data ?? [];
  // Show closed threads (history) — exclude currently open ones
  const closedThreads = threads.filter(t => t.status === 'closed');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* History header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to chat"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">Chat History</span>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : closedThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-border">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No past conversations yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Your completed chats will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {closedThreads.map(thread => {
              const moduleName = thread.moduleKey ? (MODULE_NAMES[thread.moduleKey] ?? thread.moduleKey) : null;
              const preview = thread.summary
                ?? (thread.currentRoute
                  ? deriveScreenName(thread.currentRoute, thread.moduleKey ?? undefined)
                  : 'Conversation');

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onResume(thread.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 group"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                    <MessageCircle className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {preview}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(thread.updatedAt ?? thread.createdAt)}
                      </span>
                      {moduleName && (
                        <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                          {moduleName}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type PanelView = 'chat' | 'history';

function AiAssistantPanelInner({ onClose }: { onClose: () => void }) {
  const {
    messages, isStreaming, isLoadingHistory, error,
    sendMessage, stopStreaming, resetThread, closeCurrentThread, resumeThread,
    requestHandoff, context,
  } = useAiAssistantChat();
  const [handoffPending, setHandoffPending] = useState(false);
  const { can, isLoading: permsLoading } = usePermissions();
  const canChat = !permsLoading && can('ai_support.chat');
  const [inputValue, setInputValue] = useState('');
  const [view, setView] = useState<PanelView>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const screenName = deriveScreenName(context.route, context.moduleKey);

  // Auto-close thread when panel unmounts (user closes panel).
  // closeCurrentThread reads threadIdRef internally, so it always
  // captures the latest thread ID — no stale closure risk.
  const closeRef = useRef(closeCurrentThread);
  closeRef.current = closeCurrentThread;
  useEffect(() => {
    return () => {
      closeRef.current();
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open or when returning to chat view
  useEffect(() => {
    if (view === 'chat') {
      inputRef.current?.focus();
    }
  }, [view]);

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
    setView('chat');
    inputRef.current?.focus();
  }, [resetThread]);

  const handleResume = useCallback(
    async (threadId: string) => {
      setView('chat');
      await resumeThread(threadId);
    },
    [resumeThread],
  );

  // ─── History view ──────────────────────────────────────────────────

  if (view === 'history') {
    return (
      <div className="flex h-full w-full flex-col">
        {/* Header — same style as chat */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-bold text-foreground">AI Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="New chat"
            >
              <Plus className="h-3 w-3" />
              New chat
            </button>
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
        <ThreadHistoryList onResume={handleResume} onBack={() => setView('chat')} />
      </div>
    );
  }

  // ─── Chat view ─────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-foreground">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView('history')}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Chat history"
          >
            <Clock className="h-3 w-3" />
            History
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="New chat"
            >
              <RotateCcw className="h-3 w-3" />
              New
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

      {/* Loading state for thread resume */}
      {isLoadingHistory ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-xs text-muted-foreground">Loading conversation...</p>
          </div>
        </div>
      ) : (
        <>
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

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="shrink-0 rounded-md bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300 transition-colors hover:bg-red-500/30"
                >
                  New chat
                </button>
              </div>
            )}

            {/* Talk to a person */}
            {messages.length > 0 && !isStreaming && (() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              const showHandoff = lastAssistant && (
                lastAssistant.answerConfidence === 'low' ||
                lastAssistant.messageText.includes('reaching out to your system administrator')
              );
              if (!showHandoff) return null;
              return (
                <button
                  type="button"
                  disabled={handoffPending}
                  onClick={async () => {
                    setHandoffPending(true);
                    await requestHandoff();
                    setHandoffPending(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <UserRound className="h-3.5 w-3.5" />
                  {handoffPending ? 'Connecting...' : 'Talk to a person'}
                </button>
              );
            })()}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
            {canChat ? (
              <>
                <div className="flex items-end gap-2 rounded-xl border border-border bg-surface focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything…"
                    rows={1}
                    disabled={isStreaming || isLoadingHistory}
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
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                Chat is view-only for your role. Contact a manager to enable messaging.
              </p>
            )}
          </div>
        </>
      )}
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
