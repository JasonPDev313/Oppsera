'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  mode: 'retail' | 'fnb';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class POSErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const label = this.props.mode === 'fnb' ? 'F&B POS' : 'Retail POS';
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted p-8">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h3 className="text-lg font-semibold text-foreground">
            {label} Error
          </h3>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Something went wrong. Your session data is preserved — click below to reload.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <RefreshCw className="h-4 w-4" />
            Reload POS
          </button>
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
