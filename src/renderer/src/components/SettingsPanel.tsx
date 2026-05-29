import type { Theme } from '../types'

interface Props {
  theme:         Theme
  onThemeChange: (t: Theme) => void
  onClose:       () => void
}

export default function SettingsPanel({ theme, onThemeChange, onClose }: Props) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>⚙ Настройки</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Оформление</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Тема
            </label>
            <div className="theme-toggle">
              <button
                className={`theme-option${theme === 'light' ? ' active' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                ☀ Светлая
              </button>
              <button
                className={`theme-option${theme === 'dark' ? ' active' : ''}`}
                onClick={() => onThemeChange('dark')}
              >
                🌙 Тёмная
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 22px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 16, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>StudyHub</strong> v1.0.0<br />
            Данные хранятся локально на вашем компьютере.
          </div>
        </div>
      </div>
    </div>
  )
}
