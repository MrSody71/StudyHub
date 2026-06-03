import type { SyncStatus } from '../lib/sync'

interface Props {
  status:      SyncStatus
  lastSyncAt:  string | null
  onClick:     () => void
}

export default function CloudStatus({ status, lastSyncAt, onClick }: Props) {
  const label =
    status === 'syncing' ? 'Синхронизация…' :
    status === 'error'   ? 'Ошибка синхронизации' :
    lastSyncAt           ? `Синхронизировано: ${new Date(lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` :
    'Нажмите для синхронизации'

  return (
    <button
      className={`cloud-status-btn cloud-status-${status}`}
      onClick={onClick}
      title={label}
      disabled={status === 'syncing'}
    >
      <span className={`cloud-icon${status === 'syncing' ? ' cloud-spinning' : ''}`}>
        {status === 'error' ? '⚠' : '☁'}
      </span>
      <span className="cloud-label">{label}</span>
    </button>
  )
}
