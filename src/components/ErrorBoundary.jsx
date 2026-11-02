import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      if (this.props.compact) {
        return (
          <section className="card">
            <h3>{this.props.title || 'This panel hit an error'}</h3>
            <p className="form-hint">
              The rest of this page still works. Press <strong>F5</strong> to reload, or try again.
            </p>
            <pre
              style={{
                background: '#fef2f2',
                color: '#991b1b',
                padding: '0.75rem',
                borderRadius: 8,
                overflow: 'auto',
                fontSize: '0.85rem',
              }}
            >
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </section>
        )
      }
      return (
        <div className="page" style={{ padding: '2rem', maxWidth: 640, margin: '2rem auto' }}>
          <h1 style={{ color: '#0f172a' }}>Something went wrong</h1>
          <p style={{ color: '#64748b' }}>
            The app hit an error while loading. Press <strong>Ctrl+Shift+R</strong> to refresh,
            or press <strong>F5</strong> / <strong>Ctrl+Shift+B</strong> to restart the server
            if the page will not load.
          </p>
          <pre
            style={{
              background: '#fef2f2',
              color: '#991b1b',
              padding: '1rem',
              borderRadius: 8,
              overflow: 'auto',
              fontSize: '0.85rem',
            }}
          >
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
