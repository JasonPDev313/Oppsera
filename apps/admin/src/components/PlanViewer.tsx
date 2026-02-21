'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  plan: Record<string, unknown> | null;
  rationale?: Record<string, unknown> | null;
}

function JsonTree({
  data,
  depth = 0,
}: {
  data: unknown;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) {
    return <span className="text-slate-500">null</span>;
  }
  if (typeof data === 'boolean') {
    return <span className="text-amber-400">{String(data)}</span>;
  }
  if (typeof data === 'number') {
    return <span className="text-sky-400">{data}</span>;
  }
  if (typeof data === 'string') {
    return <span className="text-emerald-400">"{data}"</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-slate-400">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-400 hover:text-white mr-1"
        >
          {collapsed ? <ChevronRight size={12} className="inline" /> : <ChevronDown size={12} className="inline" />}
        </button>
        {collapsed ? (
          <span className="text-slate-400">[{data.length} items]</span>
        ) : (
          <span>
            {'['}
            <div className="ml-4">
              {data.map((item, i) => (
                <div key={i}>
                  <JsonTree data={item} depth={depth + 1} />
                  {i < data.length - 1 && <span className="text-slate-600">,</span>}
                </div>
              ))}
            </div>
            {']'}
          </span>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate-400">{'{}'}</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-400 hover:text-white mr-1"
        >
          {collapsed ? <ChevronRight size={12} className="inline" /> : <ChevronDown size={12} className="inline" />}
        </button>
        {collapsed ? (
          <span className="text-slate-400">{`{${entries.length} keys}`}</span>
        ) : (
          <span>
            {'{'}
            <div className="ml-4">
              {entries.map(([key, val], i) => (
                <div key={key}>
                  <span className="text-indigo-300">"{key}"</span>
                  <span className="text-slate-400">: </span>
                  <JsonTree data={val} depth={depth + 1} />
                  {i < entries.length - 1 && <span className="text-slate-600">,</span>}
                </div>
              ))}
            </div>
            {'}'}
          </span>
        )}
      </span>
    );
  }
  return <span className="text-white">{String(data)}</span>;
}

export function PlanViewer({ plan, rationale }: Props) {
  const [tab, setTab] = useState<'plan' | 'rationale'>('plan');

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex border-b border-slate-700">
        {(['plan', 'rationale'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'text-white border-b-2 border-indigo-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-4 font-mono text-xs overflow-auto max-h-72">
        {tab === 'plan' ? (
          plan ? (
            <JsonTree data={plan} />
          ) : (
            <span className="text-slate-500">No plan (clarification needed)</span>
          )
        ) : rationale ? (
          <JsonTree data={rationale} />
        ) : (
          <span className="text-slate-500">No rationale captured</span>
        )}
      </div>
    </div>
  );
}
