'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CanvasErrorBoundary extends Component<Props, State> {
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
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-gray-50 p-8">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            Canvas Error
          </h3>
          <p className="max-w-md text-center text-sm text-gray-600">
            Something went wrong rendering the canvas. Your layout data is preserved.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Editor
          </button>
          {this.state.error && (
            <details className="mt-2 max-w-md text-xs text-gray-400">
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
