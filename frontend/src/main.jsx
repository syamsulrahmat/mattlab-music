import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught exception:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'REACT ERROR BOUNDARY',
          message: error?.message || String(error),
          stack: (error?.stack || '') + '\n\nComponent Stack:\n' + (errorInfo?.componentStack || ''),
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-surface-island text-content-primary font-mono min-h-screen box-border overflow-auto relative z-[999999]">
          <h1 className="text-red-500 text-2xl mb-4 font-bold">
            ⚠️ UI Runtime Error
          </h1>
          <p className="text-content-secondary mb-4">
            A client-side error occurred during rendering. Details below:
          </p>
          <div className="bg-surface-elevated border border-border-strong rounded-lg p-4 mb-4 text-red-400 whitespace-pre-wrap break-words">
            <strong>{this.state.error?.toString()}</strong>
            {'\n\n'}
            {this.state.error?.stack}
          </div>
          {this.state.errorInfo?.componentStack && (
            <div className="bg-surface-panel border border-border-medium rounded-lg p-4 text-content-muted whitespace-pre-wrap text-xs">
              <strong>Component Tree:</strong>
              {'\n'}
              {this.state.errorInfo.componentStack}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-5 px-5 py-2.5 bg-brand-500 text-black font-bold rounded-full cursor-pointer hover:bg-brand-400 transition"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
