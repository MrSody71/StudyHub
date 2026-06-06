import type { AppView } from '../types'

interface Props {
  open:           boolean
  view:           AppView
  pomRunning:     boolean
  isAdmin:        boolean
  supportUnread:  number
  onNavigate:     (v: AppView) => void
  onSettings:     () => void
  onSupport:      () => void
  onClose:        () => void
}

const NAV_ITEMS: { view: AppView; icon: string; label: string }[] = [
  { view: 'dashboard', icon: '🏠', label: 'Дашборд'    },
  { view: 'subjects',  icon: '📚', label: 'Предметы'   },
  { view: 'tasks',     icon: '📋', label: 'Задания'     },
  { view: 'schedule',  icon: '🗓', label: 'Расписание'  },
  { view: 'calendar',  icon: '📅', label: 'Календарь'   },
  { view: 'timer',     icon: '⏱', label: 'Таймер'      },
  { view: 'wallet',    icon: '💳', label: 'Кошелёк'     },
]

export default function MobileDrawer({ open, view, pomRunning, isAdmin: _isAdmin, supportUnread, onNavigate, onSettings, onSupport, onClose }: Props) {
  const navItems = NAV_ITEMS
  return (
    <>
      {/* Backdrop — darkens the rest of the screen */}
      <div
        className={`mobile-drawer-backdrop${open ? ' visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <nav className={`mobile-drawer${open ? ' open' : ''}`} aria-label="Навигация">
        {/* Header */}
        <div className="mobile-drawer-header">
          <span style={{ fontSize: 22, lineHeight: 1 }}>📚</span>
          <span className="mobile-drawer-app-title">StudyHub</span>
        </div>

        {/* Navigation items */}
        <div className="mobile-drawer-nav">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`mobile-drawer-item${view === item.view ? ' active' : ''}`}
              onClick={() => { onNavigate(item.view); onClose() }}
            >
              <span className="mobile-drawer-icon">
                {item.icon}
                {item.view === 'timer' && pomRunning && (
                  <span className="mobile-drawer-badge" />
                )}

              </span>
              {item.label}
            </button>
          ))}

          <div className="mobile-drawer-divider" />

          {/* Support */}
          <button
            className="mobile-drawer-item"
            onClick={() => { onSupport(); onClose() }}
            style={{ position: 'relative' }}
          >
            <span className="mobile-drawer-icon">💬</span>
            Поддержка
            {supportUnread > 0 && (
              <span style={{
                marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                borderRadius: '999px', fontSize: 10, fontWeight: 700,
                padding: '1px 6px', lineHeight: 1.4,
              }}>{supportUnread}</span>
            )}
          </button>

          {/* Settings */}
          <button
            className="mobile-drawer-item"
            onClick={() => { onSettings(); onClose() }}
          >
            <span className="mobile-drawer-icon">⚙</span>
            Настройки
          </button>
        </div>
      </nav>
    </>
  )
}
