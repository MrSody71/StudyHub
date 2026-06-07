import { Component, type ReactNode } from 'react'

interface Props  { children: ReactNode }
interface State  { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isSupabaseNotConfigured = /supabase не настроен/i.test(error.message)

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', padding: 32,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f9fafb', color: '#1f2937',
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Что-то пошло не так</h2>
        <p style={{
          color: '#6b7280', marginBottom: 24, textAlign: 'center',
          maxWidth: 500, lineHeight: 1.6,
        }}>
          {isSupabaseNotConfigured
            ? 'Суpabase не настроен. Откройте Настройки и укажите URL и ключ Supabase.'
            : (error.message || 'Неизвестная ошибка')}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff',
            cursor: 'pointer', fontSize: 14, fontWeight: 500,
          }}
        >
          Попробовать ещё раз
        </button>
        <details style={{ marginTop: 28, maxWidth: 640, width: '100%' }}>
          <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 12 }}>
            Технические детали
          </summary>
          <pre style={{
            marginTop: 8, padding: 12, background: '#f3f4f6',
            borderRadius: 6, fontSize: 11, overflow: 'auto',
            color: '#374151', border: '1px solid #e5e7eb',
          }}>
            {error.stack || String(error)}
          </pre>
        </details>
      </div>
    )
  }
}
