import type { FC } from 'react'

type AppView = 'dashboard' | 'tasks' | 'schedule' | 'calendar' | 'timer'

interface BottomNavProps {
  view: AppView
  onViewChange: (v: AppView) => void
  pomRunning?: boolean
}

const ITEMS: { view: AppView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Дашборд',    icon: '🏠' },
  { view: 'tasks',     label: 'Задания',     icon: '📋' },
  { view: 'schedule',  label: 'Расписание',  icon: '🗓' },
  { view: 'calendar',  label: 'Календарь',   icon: '📅' },
  { view: 'timer',     label: 'Таймер',      icon: '⏱' },
]

const BottomNav: FC<BottomNavProps> = ({ view, onViewChange, pomRunning }) => (
  <nav className="bottom-nav">
    {ITEMS.map((item) => (
      <button
        key={item.view}
        className={`bottom-nav-item${view === item.view ? ' active' : ''}`}
        onClick={() => onViewChange(item.view)}
      >
        <span className="bottom-nav-icon">
          {item.icon}
          {item.view === 'timer' && pomRunning && <span className="bottom-nav-badge" />}
        </span>
        <span className="bottom-nav-label">{item.label}</span>
      </button>
    ))}
  </nav>
)

export default BottomNav
