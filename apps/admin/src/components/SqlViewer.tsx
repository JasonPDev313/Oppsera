'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  sql: string | null;
  errors?: string[] | null;
}

export function SqlViewer({ sql, errors }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!sql) return;
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!sql) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-4">
        <p className="text-slate-500 text-sm">No SQL compiled</p>
        {errors && errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-red-400 text-xs">
                ⚠ {err}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <span className="text-xs text-slate-400 font-medium">Compiled SQL</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs text-slate-200 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
        {sql}
      </pre>
      {errors && errors.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-red-400 text-xs">
              ⚠ {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
