'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wrench, Search, GitBranch, TrendingUp, FlaskConical } from 'lucide-react';
import { useRootCause } from '@/hooks/use-root-cause';
import { useCorrelations } from '@/hooks/use-correlations';
import { useForecast } from '@/hooks/use-forecast';
import { useWhatIf } from '@/hooks/use-whatif';
import { RootCausePanel } from '@/components/insights/RootCausePanel';
import { CorrelationChart } from '@/components/insights/CorrelationChart';
import { ForecastChart } from '@/components/insights/ForecastChart';
import { WhatIfPanel } from '@/components/insights/WhatIfPanel';

// ── Tab definitions ───────────────────────────────────────────────

const TABS = [
  { key: 'root-cause', label: 'Root Cause', icon: Search },
  { key: 'correlations', label: 'Correlations', icon: GitBranch },
  { key: 'forecast', label: 'Forecast', icon: TrendingUp },
  { key: 'what-if', label: 'What-If', icon: FlaskConical },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ── ToolsContent ──────────────────────────────────────────────────

export default function ToolsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('root-cause');

  const rootCause = useRootCause();
  const correlations = useCorrelations();
  const forecast = useForecast();
  const whatIf = useWhatIf();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Chat
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analysis Tools</h1>
          <p className="text-sm text-muted-foreground">
            Advanced analytics powered by your semantic layer
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}
              `}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {/* Root Cause */}
        {activeTab === 'root-cause' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1">Root Cause Analysis</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Identify what drove a metric change by decomposing it across dimensions.
              </p>
              {rootCause.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                </div>
              )}
              {rootCause.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                  {rootCause.error}
                </div>
              )}
              {!rootCause.isLoading && !rootCause.error && !rootCause.result && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Run a root cause analysis from the AI Chat to see results here.
                  </p>
                </div>
              )}
              {rootCause.result && (
                <RootCausePanel result={rootCause.result as never} />
              )}
            </div>
          </div>
        )}

        {/* Correlations */}
        {activeTab === 'correlations' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1">Metric Correlations</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Discover which metrics move together and identify leading indicators.
              </p>
              {correlations.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                </div>
              )}
              {correlations.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                  {correlations.error}
                </div>
              )}
              {!correlations.isLoading && !correlations.error && !correlations.result && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <GitBranch className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Run a correlation analysis from the AI Chat to see results here.
                  </p>
                </div>
              )}
              {correlations.result && (
                <CorrelationChart correlations={correlations.result.correlations as never} />
              )}
            </div>
          </div>
        )}

        {/* Forecast */}
        {activeTab === 'forecast' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1">Forecast</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Project future metric values with confidence intervals.
              </p>
              {forecast.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                </div>
              )}
              {forecast.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                  {forecast.error}
                </div>
              )}
              {!forecast.isLoading && !forecast.error && !forecast.result && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Run a forecast from the AI Chat to see projections here.
                  </p>
                </div>
              )}
              {forecast.result && (
                <ForecastChart
                  historical={forecast.result.dataPoints
                    .filter((dp) => dp.isActual)
                    .map((dp) => ({ date: dp.date, value: dp.value }))}
                  forecast={forecast.result.dataPoints
                    .filter((dp) => !dp.isActual)
                    .map((dp) => ({
                      date: dp.date,
                      predicted: dp.value,
                      upperBound: dp.upperBound,
                      lowerBound: dp.lowerBound,
                    }))}
                  metric={forecast.result.metricDisplayName}
                  trend={forecast.result.trend}
                />
              )}
            </div>
          </div>
        )}

        {/* What-If */}
        {activeTab === 'what-if' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-1">What-If Scenarios</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Simulate the impact of price, volume, or cost changes on your metrics.
              </p>
              <WhatIfPanel
                onSimulate={(input) => {
                  const scenarioText = input.scenarios
                    .map((s) => `${s.label}: ${s.adjustmentType} ${s.changePct > 0 ? '+' : ''}${s.changePct}%`)
                    .join(', ');
                  whatIf.simulate(`${input.baseMetric} with ${scenarioText}`);
                }}
                isLoading={whatIf.isLoading}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
