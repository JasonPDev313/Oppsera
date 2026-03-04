'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Code2, Zap } from 'lucide-react';
import type { LoadedTurn } from '@/hooks/use-semantic-chat';
import { renderMarkdown, QueryResultTable } from '@/components/semantic/chat-message';

const INITIAL_TURNS = 3;

export function SessionPreview({ turns }: { turns: LoadedTurn[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? turns : turns.slice(0, INITIAL_TURNS);

  return (
    <div className="space-y-3 py-3">
      {visible.map((turn) => (
        <div key={turn.id} className="space-y-2">
          {/* User message */}
          <div className="flex justify-end">
            <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
              {turn.userMessage}
            </div>
          </div>

          {/* AI response */}
          <div className="flex justify-start">
            <div className="max-w-[90%] w-full">
              <div className="flex items-center gap-1.5 mb-1.5 text-primary">
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">AI Insights</span>
              </div>

              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                {/* Narrative */}
                {turn.wasClarification ? (
                  <div className="text-sm text-card-foreground">
                    <div className="mb-2 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded inline-block">
                      Clarification needed
                    </div>
                    <p>{turn.clarificationMessage ?? 'Could you clarify your question?'}</p>
                  </div>
                ) : turn.narrative ? (
                  <div className="prose prose-sm max-w-none text-card-foreground">
                    {renderMarkdown(turn.narrative)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No response generated</p>
                )}

                {/* Data table (read-only, no drill-down) */}
                {turn.resultSample && turn.resultSample.length > 0 && (
                  <QueryResultTable
                    rows={turn.resultSample}
                    rowCount={turn.rowCount ?? turn.resultSample.length}
                  />
                )}

                {/* Collapsible SQL */}
                {turn.compiledSql && (
                  <SqlDetails sql={turn.compiledSql} />
                )}
              </div>

              <div className="mt-1 text-xs text-muted-foreground pl-1">
                {new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>
      ))}

      {turns.length > INITIAL_TURNS && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors py-1"
        >
          {showAll ? 'Show fewer turns' : `Show all ${turns.length} turns`}
        </button>
      )}
    </div>
  );
}

function SqlDetails({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Code2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">SQL Query</span>
        {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 bg-muted/50">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}
