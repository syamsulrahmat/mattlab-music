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
        <div style={{
          padding: '32px',
          backgroundColor: '#121212',
          color: '#ffffff',
          fontFamily: 'monospace',
          minHeight: '100vh',
          boxSizing: 'border-box',
          overflow: 'auto',
          zIndex: 999999,
          position: 'relative'
        }}>
          <h1 style={{ color: '#ff4d4d', fontSize: '24px', marginBottom: '16px', fontWeight: 'bold' }}>
            ⚠️ UI Runtime Error
          </h1>
          <p style={{ color: '#b3b3b3', marginBottom: '16px' }}>
            A client-side error occurred during rendering. Details below:
          </p>
          <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            color: '#ff7b72',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <strong>{this.state.error?.toString()}</strong>
            {'\n\n'}
            {this.state.error?.stack}
          </div>
          {this.state.errorInfo?.componentStack && (
            <div style={{
              background: '#1a1a1a',
              border: '1px solid #282828',
              borderRadius: '8px',
              padding: '16px',
              color: '#8b949e',
              whiteSpace: 'pre-wrap',
              fontSize: '12px',
            }}>
              <strong>Component Tree:</strong>
              {'\n'}
              {this.state.errorInfo.componentStack}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: 'var(--brand-primary, #f59e0b)',
              color: '#000',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '24px',
              cursor: 'pointer'
            }}
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
