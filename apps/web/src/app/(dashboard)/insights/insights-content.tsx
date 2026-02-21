'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useSemanticChat } from '@/hooks/use-semantic-chat';
import { ChatMessageBubble } from '@/components/semantic/chat-message';
import { ChatInput } from '@/components/semantic/chat-input';

// ── Suggested questions ───────────────────────────────────────────

const SUGGESTIONS = [
  'How many rounds were played yesterday?',
  'What was our green fee revenue this week?',
  'Show me rounds by booking channel this month',
  'What was our utilization rate last week by course?',
  'Compare green fee and cart revenue by day this month',
];

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
  const { messages, isLoading, error, sendMessage, cancelRequest, clearMessages } = useSemanticChat();
  const [showDebug, setShowDebug] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;
  const elapsed = useElapsedSeconds(isLoading);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-900">AI Insights</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">Ask questions about your data in plain English</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Debug toggle */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            title="Toggle debug panel"
          >
            {showDebug ? (
              <ToggleRight className="h-4 w-4 text-indigo-500" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Debug</span>
          </button>

          {/* Clear conversation */}
          {!isEmpty && (
            <button
              onClick={clearMessages}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Message area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-indigo-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Ask anything about your business
            </h2>
            <p className="text-gray-500 max-w-sm text-sm mb-8">
              Get instant answers from your data — rounds played, revenue, utilization, and more.
            </p>

            {/* Suggested questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="text-left px-4 py-3 text-sm bg-surface-raised border border-gray-200 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors text-gray-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            showDebug={showDebug && msg.role === 'assistant'}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface-raised border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
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

      {/* ── Input area ── */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-gray-200 bg-surface">
        <ChatInput
          onSend={sendMessage}
          onCancel={cancelRequest}
          isLoading={isLoading}
          placeholder={"Ask a question about your data\u2026 (Enter to send, Shift+Enter for new line)"}
        />
        <p className="mt-1.5 text-center text-xs text-gray-400">
          AI responses may contain errors. Verify important numbers independently.
        </p>
      </div>
    </div>
  );
}
