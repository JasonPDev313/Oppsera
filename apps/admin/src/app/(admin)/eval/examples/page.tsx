'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Trash2, Tag } from 'lucide-react';
import { useEvalExamples } from '@/hooks/use-eval';
import type { EvalExample } from '@/types/eval';

const CATEGORY_OPTIONS = [
  '', 'sales', 'inventory', 'customer', 'golf', 'comparison', 'trend', 'anomaly',
];

const DIFFICULTY_OPTIONS = ['', 'easy', 'medium', 'hard'];

function ExampleRow({ example, onDelete }: { example: EvalExample; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white line-clamp-2">{example.userMessage}</p>
        </div>
        <button
          onClick={() => {
            if (confirming) {
              onDelete();
            } else {
              setConfirming(true);
              setTimeout(() => setConfirming(false), 3000);
            }
          }}
          className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
            confirming
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Trash2 size={12} />
          {confirming ? 'Confirm?' : 'Remove'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        {example.category && (
          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded flex items-center gap-1">
            <BookOpen size={10} />
            {example.category}
          </span>
        )}
        {example.difficulty && (
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded capitalize">
            {example.difficulty}
          </span>
        )}
        {example.tags?.map((tag) => (
          <span key={tag} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded flex items-center gap-1">
            <Tag size={9} />
            {tag}
          </span>
        ))}
        <span className="text-xs text-slate-500 ml-auto">
          Used {example.usageCount}×
        </span>
      </div>

      <p className="text-xs text-slate-600 mt-2">{new Date(example.createdAt).toLocaleDateString()}</p>
    </div>
  );
}

export default function EvalExamplesPage() {
  const { data: examples, isLoading, error, load, remove } = useEvalExamples();
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');

  useEffect(() => {
    const params: Record<string, string> = {};
    if (category) params.category = category;
    if (difficulty) params.difficulty = difficulty;
    load(params);
  }, [load, category, difficulty]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Golden Examples</h1>
          <p className="text-sm text-slate-400 mt-0.5">Few-shot examples injected into LLM prompts</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <BookOpen size={13} />
          {examples.length} examples
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>

        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All difficulties</option>
          {DIFFICULTY_OPTIONS.filter(Boolean).map((d) => (
            <option key={d} value={d} className="capitalize">{d}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {examples.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No examples yet. Promote turns to examples from the eval feed.
            </div>
          ) : (
            examples.map((ex) => (
              <ExampleRow key={ex.id} example={ex} onDelete={() => remove(ex.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
