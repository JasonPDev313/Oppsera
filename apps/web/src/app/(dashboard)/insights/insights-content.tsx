'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Sparkles, Trash2, ToggleLeft, ToggleRight, Download, History,
  PanelRightOpen, PanelRightClose, BarChart3, Wrench, CalendarDays, Globe, Sliders,
  Layers, ChevronDown, X,
} from 'lucide-react';
import Link from 'next/link';
import { useSemanticChat } from '@/hooks/use-semantic-chat';
import type { LoadedTurn } from '@/hooks/use-semantic-chat';
import { ChatMessageBubble, ThinkingIndicator } from '@/components/semantic/chat-message';
import { ChatInput } from '@/components/semantic/chat-input';
import { ChatHistorySidebar } from '@/components/insights/ChatHistorySidebar';
import { NotificationBell } from '@/components/insights/NotificationBell';
import { VoiceInput } from '@/components/insights/VoiceInput';
import { apiFetch } from '@/lib/api-client';
import { exportSessionAsTxt } from '@/lib/export-chat';
import { useEntitlements } from '@/hooks/use-entitlements';

// ── Suggested questions ───────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  'What were our total sales this week?',
  'Show me revenue by department this month',
  'Which items sold the most last week?',
  'What was our average order value this month?',
  'Compare sales by day this week vs last week',
];


const HISTORY_OPEN_KEY = 'insights_history_open';
const SELECTED_LENS_KEY = 'insights_selected_lens';

// ── Lens type for the selector ──────────────────────────────────

interface ChatLens {
  slug: string;
  displayName: string;
  exampleQuestions: string[] | null;
}

// ── Elapsed timer hook ────────────────────────────────────────────

function useElapsedSeconds(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  return elapsed;
}

// ── Main component ────────────────────────────────────────────────

export default function InsightsContent() {
  // Lens selection state (persisted to localStorage)
  const [selectedLensSlug, setSelectedLensSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SELECTED_LENS_KEY) || null;
  });
  const [lenses, setLenses] = useState<ChatLens[]>([]);
  const [lensDropdownOpen, setLensDropdownOpen] = useState(false);
  const lensDropdownRef = useRef<HTMLDivElement>(null);

  const chat = useSemanticChat({ lensSlug: selectedLensSlug ?? undefined });
  const { messages, isLoading, isStreaming, error, streamingStatus, completedStages, sendMessage, cancelRequest, clearMessages, initFromSession } = chat;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showDebug, setShowDebug] = useState(false);
  const [loadedSessionDate, setLoadedSessionDate] = useState<string | null>(null);
  const [loadedTurns, setLoadedTurns] = useState<LoadedTurn[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionLoadedRef = useRef(false);
  const isEmpty = messages.length === 0;
  const elapsed = useElapsedSeconds(isLoading);
  const { isModuleEnabled } = useEntitlements();

  // Fetch enabled lenses on mount
  useEffect(() => {
    apiFetch<{ data: ChatLens[] }>('/api/v1/semantic/lenses')
      .then((res) => {
        setLenses(res.data);
        // If persisted lens no longer exists in enabled list, clear it
        if (selectedLensSlug && !res.data.some((l) => l.slug === selectedLensSlug)) {
          setSelectedLensSlug(null);
          localStorage.removeItem(SELECTED_LENS_KEY);
        }
      })
      .catch(() => { /* non-critical — lenses just won't appear */ });
  }, []);

  // Close lens dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (lensDropdownRef.current && !lensDropdownRef.current.contains(e.target as Node)) {
        setLensDropdownOpen(false);
      }
    }
    if (lensDropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [lensDropdownOpen]);

  const handleSelectLens = useCallback((slug: string | null) => {
    setSelectedLensSlug(slug);
    setLensDropdownOpen(false);
    if (slug) {
      localStorage.setItem(SELECTED_LENS_KEY, slug);
    } else {
      localStorage.removeItem(SELECTED_LENS_KEY);
    }
  }, []);

  const selectedLens = useMemo(
    () => lenses.find((l) => l.slug === selectedLensSlug) ?? null,
    [lenses, selectedLensSlug],
  );

  // Derive suggestions from selected lens (if it has exampleQuestions) or fallback
  const suggestions = useMemo(() => {
    if (selectedLens?.exampleQuestions?.length) return selectedLens.exampleQuestions;
    return DEFAULT_SUGGESTIONS;
  }, [selectedLens, isModuleEnabled]);

  // History sidebar state
  const [historyOpen, setHistoryOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(HISTORY_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeDbSessionId, setActiveDbSessionId] = useState<string | null>(null);

  // Persist desktop sidebar preference
  const toggleHistory = useCallback(() => {
    setHistoryOpen((prev) => {
      const next = !prev;
      localStorage.setItem(HISTORY_OPEN_KEY, String(next));
      return next;
    });
  }, []);

  // Load session from URL param on mount
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (!sessionParam || sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    loadSession(sessionParam);
  }, [searchParams]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load a session by ID (shared between URL param and sidebar click)
  const loadSession = useCallback(async (dbSessionId: string) => {
    try {
      const res = await apiFetch<{
        data: {
          session: { id: string; startedAt: string };
          turns: LoadedTurn[];
        };
      }>(`/api/v1/semantic/sessions/${dbSessionId}`);
      initFromSession(res.data.session.id, res.data.turns);
      setLoadedSessionDate(res.data.session.startedAt);
      setLoadedTurns(res.data.turns);
      setActiveDbSessionId(res.data.session.id);
      // Clean up URL param if present
      if (searchParams.get('session')) {
        router.replace('/insights');
      }
    } catch {
      if (searchParams.get('session')) {
        router.replace('/insights');
      }
    }
  }, [initFromSession, router, searchParams]);

  // Handle sidebar session selection
  const handleSelectSession = useCallback((dbSessionId: string) => {
    loadSession(dbSessionId);
    setMobileHistoryOpen(false);
  }, [loadSession]);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    clearMessages();
    setLoadedSessionDate(null);
    setLoadedTurns(null);
    setActiveDbSessionId(null);
    setMobileHistoryOpen(false);
  }, [clearMessages]);

  // Wrap sendMessage to trigger sidebar refresh after completion
  const handleSendMessage = useCallback(async (message: string) => {
    await sendMessage(message);
    // Trigger sidebar refresh after a delay (eval turn is saved asynchronously)
    setRefreshKey((k) => k + 1);
  }, [sendMessage]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background text-foreground">
      {/* ── Chat column ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">AI Insights</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">Ask questions about your data in plain English</span>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Notifications */}
            <NotificationBell />

            {/* Debug toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle debug panel"
            >
              {showDebug ? (
                <ToggleRight className="h-4 w-4 text-primary" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Debug</span>
            </button>

            {/* Export current session */}
            {loadedTurns && !isEmpty && (
              <button
                onClick={() => {
                  exportSessionAsTxt(
                    messages[0]?.content ?? 'AI Insights',
                    loadedSessionDate ?? new Date().toISOString(),
                    loadedTurns,
                  );
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Export conversation as .txt"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {/* Clear conversation */}
            {!isEmpty && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}

            {/* History sidebar toggle — desktop */}
            <button
              onClick={toggleHistory}
              className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title={historyOpen ? 'Hide history' : 'Show history'}
            >
              {historyOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>

            {/* History sidebar toggle — mobile */}
            <button
              onClick={() => setMobileHistoryOpen(true)}
              className="lg:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Chat history"
            >
              <History className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Loaded session banner */}
        {loadedSessionDate && !isEmpty && (
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/30 text-xs text-indigo-500 shrink-0">
            <History className="h-3.5 w-3.5" />
            <span>
              Continuing conversation from{' '}
              {new Date(loadedSessionDate).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* Message area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {isEmpty && (
              <div className="flex flex-col items-center justify-center text-center py-12" style={{ minHeight: 'calc(100vh - 250px)' }}>
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Ask anything about your business
                </h2>
                <p className="text-muted-foreground max-w-sm text-sm mb-8">
                  Get instant answers from your data — sales, revenue, inventory, and more.
                </p>

                {/* Suggested questions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSendMessage(suggestion)}
                      className="text-left px-4 py-3 text-sm bg-card border border-border rounded-xl hover:border-primary/50 hover:bg-accent transition-colors text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                {/* Quick access to AI tools */}
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {[
                    { href: '/insights/watchlist', icon: BarChart3, label: 'Watchlist' },
                    { href: '/insights/tools', icon: Wrench, label: 'Analysis Tools' },
                    { href: '/insights/reports', icon: CalendarDays, label: 'Scheduled Reports' },
                    { href: '/insights/embeds', icon: Globe, label: 'Embed Widgets' },
                    { href: '/insights/authoring', icon: Sliders, label: 'Semantic Authoring' },
                  ].map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-full hover:border-primary/50 hover:text-primary transition-colors"
                    >
                      <tool.icon className="h-3.5 w-3.5" />
                      {tool.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                showDebug={showDebug && msg.role === 'assistant'}
                isStreaming={isStreaming && msg.role === 'assistant' && idx === messages.length - 1}
                onFollowUpSelect={msg.role === 'assistant' ? handleSendMessage : undefined}
              />
            ))}

            {/* Thinking indicator — shows pipeline stage progress during streaming */}
            {isStreaming && streamingStatus && (
              <ThinkingIndicator
                currentStatus={streamingStatus}
                completedStages={completedStages}
              />
            )}

            {/* Bouncing dots — fallback for non-streaming or before first SSE event */}
            {isLoading && !isStreaming && !streamingStatus && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs">
                      {elapsed >= 10
                        ? 'Taking longer than usual\u2026'
                        : elapsed >= 5
                          ? `Analyzing\u2026 ${elapsed}s`
                          : 'Analyzing\u2026'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && !isLoading && (
              <div className="text-xs text-red-500 text-center">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border bg-background">
          <div className="max-w-4xl mx-auto">
            {/* Lens selector row */}
            {lenses.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="relative" ref={lensDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setLensDropdownOpen((p) => !p)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      selectedLensSlug
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
                        : 'border-border bg-surface text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    <span>{selectedLens?.displayName ?? 'No Lens'}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${lensDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {lensDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-surface shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => handleSelectLens(null)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          !selectedLensSlug
                            ? 'bg-indigo-500/10 text-indigo-400'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className="font-medium">No Lens</span>
                        <span className="block text-muted-foreground mt-0.5">General analysis — no specific focus</span>
                      </button>
                      {lenses.map((lens) => (
                        <button
                          key={lens.slug}
                          type="button"
                          onClick={() => handleSelectLens(lens.slug)}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            selectedLensSlug === lens.slug
                              ? 'bg-indigo-500/10 text-indigo-400'
                              : 'text-foreground hover:bg-accent'
                          }`}
                        >
                          <span className="font-medium">{lens.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedLensSlug && (
                  <button
                    type="button"
                    onClick={() => handleSelectLens(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Clear lens"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ChatInput
                  onSend={handleSendMessage}
                  onCancel={cancelRequest}
                  isLoading={isLoading}
                  placeholder={selectedLens
                    ? `Ask about ${selectedLens.displayName.toLowerCase()}\u2026`
                    : "Ask a question about your data\u2026 (Enter to send, Shift+Enter for new line)"}
                />
              </div>
              <VoiceInput
                onTranscript={handleSendMessage}
                disabled={isLoading}
                className="mb-0.5"
              />
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              AI responses may contain errors. Verify important numbers independently.
            </p>
          </div>
        </div>
      </div>

      {/* ── Desktop history sidebar (inline) ── */}
      {historyOpen && (
        <div className="hidden lg:flex w-80 shrink-0 border-l border-border flex-col bg-card">
          <ChatHistorySidebar
            activeSessionId={activeDbSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            refreshKey={refreshKey}
          />
        </div>
      )}

      {/* ── Mobile history overlay ── */}
      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileHistoryOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] shadow-xl bg-card">
            <ChatHistorySidebar
              activeSessionId={activeDbSessionId}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onClose={() => setMobileHistoryOpen(false)}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      )}
    </div>
  );
}
