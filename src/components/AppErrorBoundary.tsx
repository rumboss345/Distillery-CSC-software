import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors so production shows a message instead of a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App failed to render', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="loading-screen">
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Something went wrong</h1>
          <p style={{ maxWidth: '36rem', marginBottom: '1rem' }}>
            The app hit an error while loading. Try a hard refresh. If this continues after a deploy,
            roll back on Render or send this message to support.
          </p>
          <pre
            style={{
              maxWidth: '42rem',
              overflow: 'auto',
              padding: '0.75rem',
              background: 'var(--bg-elevated, #1c1418)',
              borderRadius: '6px',
              fontSize: '0.85rem',
            }}
          >
            {error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
