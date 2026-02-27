'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  mode: 'retail' | 'fnb';
}

interface State {
  hasError: boolean;
  error: Error | null;
  crashCount: number;
}

/** Max soft-reloads before recommending a full page refresh */
const MAX_SOFT_RELOADS = 2;

export class POSErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, crashCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Compute next count before setState — this.state may be stale after batched setState
    const nextCrashCount = this.state.crashCount + 1;

    // Increment crash count when an error is caught
    this.setState({ crashCount: nextCrashCount });

    // Log enough context to diagnose in production
    // eslint-disable-next-line no-console
    console.error(
      `[POSErrorBoundary] ${this.props.mode} crash #${nextCrashCount}:`,
      error.message,
      error.stack,
    );
  }

  handleSoftReload = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const label = this.props.mode === 'fnb' ? 'F&B POS' : 'Retail POS';
      const isRepeatedCrash = this.state.crashCount >= MAX_SOFT_RELOADS;

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted p-8">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h3 className="text-lg font-semibold text-foreground">
            {label} Error
          </h3>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {isRepeatedCrash
              ? 'This error has occurred multiple times. A full page refresh is recommended.'
              : 'Something went wrong. Your session data is preserved — click below to reload.'}
          </p>

          <div className="flex items-center gap-3">
            {isRepeatedCrash ? (
              <>
                <button
                  onClick={this.handleHardReload}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <RotateCcw className="h-4 w-4" />
                  Full Page Refresh
                </button>
                <button
                  onClick={this.handleSoftReload}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </button>
              </>
            ) : (
              <button
                onClick={this.handleSoftReload}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <RefreshCw className="h-4 w-4" />
                Reload POS
              </button>
            )}
          </div>

          {this.state.error && (
            <details className="mt-2 max-w-md text-xs text-muted-foreground">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="mt-1 whitespace-pre-wrap">{this.state.error.message}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
