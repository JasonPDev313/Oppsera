'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Printer, Copy, Check, ChevronDown, FileText, FileCode, Globe } from 'lucide-react';
import type { ExportableTurn } from '@/lib/export-chat';
import {
  exportSessionAsTxt,
  exportSessionAsMarkdown,
  exportSessionAsHtml,
  printSession,
  copySessionToClipboard,
} from '@/lib/export-chat';

interface ConversationToolbarProps {
  title: string;
  startedAt: string;
  turns: ExportableTurn[];
}

export function ConversationToolbar({ title, startedAt, turns }: ConversationToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

  const handleCopy = async () => {
    await copySessionToClipboard(title, startedAt, turns);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      {/* Export dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setExportOpen((p) => !p)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Export conversation"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
        </button>

        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-surface shadow-lg z-20 py-1">
            <button
              type="button"
              onClick={() => { exportSessionAsTxt(title, startedAt, turns); setExportOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Plain Text (.txt)
            </button>
            <button
              type="button"
              onClick={() => { exportSessionAsMarkdown(title, startedAt, turns); setExportOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
              Markdown (.md)
            </button>
            <button
              type="button"
              onClick={() => { exportSessionAsHtml(title, startedAt, turns); setExportOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              HTML (.html)
            </button>
          </div>
        )}
      </div>

      {/* Print */}
      <button
        type="button"
        onClick={() => printSession(title, startedAt, turns)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Print conversation"
      >
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">Print</span>
      </button>

      {/* Copy to clipboard */}
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Copy conversation as Markdown"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
      </button>
    </div>
  );
}
