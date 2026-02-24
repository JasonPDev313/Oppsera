'use client';

import { useState } from 'react';
import { Play, Trash2, Zap, Code, Database, FileText, Bug } from 'lucide-react';
import { usePlayground } from '@/hooks/use-eval-training';
import type { PlaygroundRequest } from '@/types/eval';

const TABS = [
  { key: 'intent', label: 'Intent', icon: Zap },
  { key: 'plan', label: 'Plan', icon: Zap },
  { key: 'sql', label: 'SQL', icon: Code },
  { key: 'results', label: 'Results', icon: Database },
  { key: 'narrative', label: 'Narrative', icon: FileText },
  { key: 'debug', label: 'Debug', icon: Bug },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const MODEL_OPTIONS = [
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
];

function JsonViewer({ data }: { data: unknown }) {
  if (data == null) {
    return <p className="text-sm text-slate-500 italic">No data</p>;
  }
  return (
    <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 font-mono overflow-auto max-h-96 whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 italic">No result rows</p>;
  }
  const columns = Object.keys(rows[0]!);
  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            {columns.map((col) => (
              <th key={col} className="text-left text-slate-400 font-medium px-3 py-2 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
              {columns.map((col) => (
                <td key={col} className="text-slate-300 px-3 py-2 whitespace-nowrap">
                  {row[col] != null ? String(row[col]) : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlaygroundPage() {
  const { result, isRunning, error, run, clear } = usePlayground();

  const [question, setQuestion] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('claude-3-haiku');
  const [temperature, setTemperature] = useState(0.3);
  const [activeTab, setActiveTab] = useState<TabKey>('intent');

  const handleRun = async () => {
    if (!question.trim()) return;
    const payload: PlaygroundRequest = {
      question: question.trim(),
      model,
      temperature,
    };
    if (tenantId.trim()) payload.tenantId = tenantId.trim();
    if (systemPrompt.trim()) payload.systemPrompt = systemPrompt.trim();
    await run(payload);
    setActiveTab('intent');
  };

  const handleClear = () => {
    setQuestion('');
    setTenantId('');
    setSystemPrompt('');
    setModel('claude-3-haiku');
    setTemperature(0.3);
    clear();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Prompt Playground</h1>
        <p className="text-sm text-slate-400 mt-0.5">Test AI queries interactively and inspect each pipeline stage</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel — Input */}
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <label className="block text-xs text-slate-400 mb-1.5">Question</label>
            <textarea
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a business question..."
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 resize-none"
            />

            <label className="block text-xs text-slate-400 mb-1.5 mt-4">Tenant ID (optional)</label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. 01HZ..."
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
            />

            <label className="block text-xs text-slate-400 mb-1.5 mt-4">System Prompt Override (optional)</label>
            <textarea
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Override the default system prompt..."
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 resize-none"
            />

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Temperature: {temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleRun}
                disabled={isRunning || !question.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {isRunning ? 'Running...' : 'Run Query'}
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Results */}
        <div>
          {!result && !isRunning && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col items-center justify-center min-h-[300px] text-center">
              <Zap size={32} className="text-slate-600 mb-3" />
              <p className="text-sm text-slate-500">Enter a question and click Run to see results</p>
            </div>
          )}

          {isRunning && !result && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 mt-4">Executing pipeline...</p>
            </div>
          )}

          {result && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-slate-700 overflow-x-auto">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.key
                          ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon size={12} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {activeTab === 'intent' && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Resolved Intent</h3>
                    <JsonViewer data={result.intent} />
                  </div>
                )}

                {activeTab === 'plan' && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">LLM Plan</h3>
                    <JsonViewer data={result.plan} />
                  </div>
                )}

                {activeTab === 'sql' && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Compiled SQL</h3>
                    {result.compiledSql ? (
                      <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-green-400 font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                        {result.compiledSql}
                      </pre>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No SQL generated</p>
                    )}
                  </div>
                )}

                {activeTab === 'results' && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">
                      Query Results
                      {result.executionResult && (
                        <span className="text-xs text-slate-400 font-normal ml-2">
                          ({result.executionResult.length} rows)
                        </span>
                      )}
                    </h3>
                    {result.executionResult && result.executionResult.length > 0 ? (
                      <ResultsTable rows={result.executionResult} />
                    ) : (
                      <p className="text-sm text-slate-500 italic">No result rows</p>
                    )}
                  </div>
                )}

                {activeTab === 'narrative' && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Narrative Response</h3>
                    {result.narrative ? (
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {result.narrative}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No narrative generated</p>
                    )}
                  </div>
                )}

                {activeTab === 'debug' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-white">Debug Info</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Latency</p>
                        <p className="text-sm font-medium text-white mt-0.5">{result.latencyMs}ms</p>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Cost</p>
                        <p className="text-sm font-medium text-white mt-0.5">
                          {result.costUsd != null ? `$${result.costUsd.toFixed(6)}` : '-'}
                        </p>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Tokens In</p>
                        <p className="text-sm font-medium text-white mt-0.5">
                          {result.tokensUsed.input.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Tokens Out</p>
                        <p className="text-sm font-medium text-white mt-0.5">
                          {result.tokensUsed.output.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {result.qualityFlags.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Quality Flags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.qualityFlags.map((flag) => (
                            <span key={flag} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.error && (
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Error</p>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
                          {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
