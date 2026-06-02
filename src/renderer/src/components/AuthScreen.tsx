import { useState } from 'react'

interface Props {
  onSignIn:      (email: string, password: string) => Promise<void>
  onSignUp:      (email: string, password: string) => Promise<void>
  onWorkLocally: () => void
}

type Tab = 'login' | 'register'

export default function AuthScreen({ onSignIn, onSignUp, onWorkLocally }: Props) {
  const [tab, setTab]           = useState<Tab>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false) // email confirmation sent

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      if (tab === 'login') {
        await onSignIn(email.trim(), password)
      } else {
        await onSignUp(email.trim(), password)
        setDone(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Translate common Supabase error messages
      if (msg.includes('Invalid login credentials')) setError('Неверный email или пароль')
      else if (msg.includes('Email not confirmed'))   setError('Подтвердите email — письмо отправлено на почту')
      else if (msg.includes('already registered'))    setError('Этот email уже зарегистрирован')
      else if (msg.includes('Password should be'))    setError('Пароль должен быть не менее 6 символов')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">📚</span>
          <span className="auth-logo-text">StudyHub</span>
        </div>

        {done ? (
          /* Email confirmation pending */
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Подтвердите почту
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Письмо со ссылкой для подтверждения отправлено на{' '}
              <strong>{email}</strong>.<br />
              После подтверждения войдите в аккаунт.
            </div>
            <button
              className="btn btn-secondary"
              style={{ marginTop: 20, width: '100%' }}
              onClick={() => { setDone(false); setTab('login') }}
            >
              Войти
            </button>
          </div>
        ) : (
          <>
            {/* Tab toggle */}
            <div className="auth-tabs">
              <button
                className={`auth-tab${tab === 'login' ? ' active' : ''}`}
                onClick={() => { setTab('login'); setError(null) }}
              >
                Вход
              </button>
              <button
                className={`auth-tab${tab === 'register' ? ' active' : ''}`}
                onClick={() => { setTab('register'); setError(null) }}
              >
                Регистрация
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && (
                <div className="auth-error">{error}</div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Пароль</label>
                <input
                  className="form-input"
                  type="password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'Минимум 6 символов' : '••••••••'}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 4 }}
                disabled={loading || !email.trim() || !password}
              >
                {loading
                  ? (tab === 'login' ? 'Входим…' : 'Регистрируем…')
                  : (tab === 'login' ? 'Войти' : 'Зарегистрироваться')}
              </button>
            </form>

            {/* Divider */}
            <div className="auth-divider"><span>или</span></div>

            {/* Work locally */}
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={onWorkLocally}
            >
              Работать локально
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
              Данные хранятся только на этом компьютере.
              Авторизоваться можно будет позже в настройках.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
