import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PharmaTrack ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('spms_session');
      localStorage.removeItem('spms_user');
      localStorage.setItem('spms_demo', 'true');
    } catch {}
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-slate-800 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-2xl font-bold font-heading text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-600 text-sm mb-6">
              An unexpected display error occurred. You can restore the app immediately by entering demo mode or reloading.
            </p>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-left text-xs font-mono text-red-700 mb-6 overflow-auto max-h-32">
              {this.state.error?.message || 'Unknown render error'}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-700 transition-colors"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-[#0EA5E9] hover:bg-[#0284C7] rounded-lg text-sm font-semibold text-white shadow-sm transition-colors"
              >
                Reset & Enter Demo Mode
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
