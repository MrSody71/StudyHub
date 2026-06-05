import { useState, useMemo } from 'react'

interface Props {
  onSignIn:      (email: string, password: string) => Promise<void>
  onSignUp:      (email: string, password: string) => Promise<void>
  onWorkLocally: () => void
}

type Tab = 'login' | 'register'

interface PasswordRule {
  label: string
  ok:    boolean
}

function checkPassword(pwd: string): PasswordRule[] {
  return [
    { label: 'Не менее 8 символов',    ok: pwd.length >= 8 },
    { label: 'Содержит буквы',          ok: /[a-zA-Zа-яА-ЯёЁ]/.test(pwd) },
    { label: 'Содержит цифры',          ok: /[0-9]/.test(pwd) },
  ]
}

export default function AuthScreen({ onSignIn, onSignUp, onWorkLocally }: Props) {
  const [tab, setTab]           = useState<Tab>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)
  const [pwdTouched, setPwdTouched] = useState(false)

  const rules   = useMemo(() => checkPassword(password), [password])
  const pwdValid = rules.every(r => r.ok)

  // Strength: 0-3
  const strength = rules.filter(r => r.ok).length

  const strengthLabel = strength === 0 ? '' :
                        strength === 1 ? 'Слабый' :
                        strength === 2 ? 'Средний' : 'Надёжный'
  const strengthColor = strength === 1 ? 'var(--danger)' :
                        strength === 2 ? 'var(--warning)' : 'var(--success)'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (tab === 'register' && !pwdValid) {
      setPwdTouched(true)
      return
    }
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
      if (msg.includes('Invalid login credentials')) setError('Неверный email или пароль')
      else if (msg.includes('Email not confirmed'))   setError('Подтвердите email — письмо отправлено на почту')
      else if (msg.includes('already registered'))    setError('Этот email уже зарегистрирован')
      else if (msg.includes('Password should be'))    setError('Пароль должен быть не менее 8 символов и содержать буквы и цифры')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setPwdTouched(false)
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
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📧</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              Подтвердите почту
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Письмо со ссылкой отправлено на{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.<br />
              После подтверждения войдите в аккаунт.
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 22, width: '100%' }}
              onClick={() => { setDone(false); switchTab('login') }}
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
                onClick={() => switchTab('login')}
              >
                Вход
              </button>
              <button
                className={`auth-tab${tab === 'register' ? ' active' : ''}`}
                onClick={() => switchTab('register')}
              >
                Регистрация
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div className="auth-error">{error}</div>}

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
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onBlur={() => tab === 'register' && setPwdTouched(true)}
                    placeholder={tab === 'register' ? 'Минимум 8 символов, буквы и цифры обязательны' : '••••••••'}
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-tertiary)', fontSize: 15, padding: '2px 4px',
                      lineHeight: 1,
                    }}
                    tabIndex={-1}
                    title={showPwd ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>

                {/* Strength bar + hint — only on register */}
                {tab === 'register' && password.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {/* Strength bar */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {[1, 2, 3].map(i => (
                        <div
                          key={i}
                          style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: i <= strength ? strengthColor : 'var(--border)',
                            transition: 'background .2s',
                          }}
                        />
                      ))}
                      {strengthLabel && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor, marginLeft: 4, whiteSpace: 'nowrap' }}>
                          {strengthLabel}
                        </span>
                      )}
                    </div>

                    {/* Error message — show only when touched and invalid */}
                    {pwdTouched && !pwdValid && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
                        Пароль должен содержать минимум 8 символов, включая буквы и цифры
                      </div>
                    )}
                  </div>
                )}

                {/* Static hint — show on register when field is empty */}
                {tab === 'register' && password.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5 }}>
                    Минимум 8 символов, буквы и цифры обязательны
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 2 }}
                disabled={loading || !email.trim() || !password || (tab === 'register' && !pwdValid)}
              >
                {loading
                  ? (tab === 'login' ? 'Входим…' : 'Регистрируем…')
                  : (tab === 'login' ? 'Войти' : 'Зарегистрироваться')}
              </button>
            </form>

            {/* Divider */}
            <div className="auth-divider"><span>или</span></div>

            {/* Work locally */}
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onWorkLocally}>
              Работать локально
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4, lineHeight: 1.6 }}>
              Данные хранятся только на этом компьютере.<br />
              Авторизоваться можно будет позже в настройках.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
