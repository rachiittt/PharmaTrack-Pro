import { Component } from 'react';

/** Last-resort boundary so a rendering bug never leaves a blank screen. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-3">
            The page hit an unexpected error. Your data is safe — nothing is saved unless the server confirms it.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-ink-2">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
