import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface UserStats {
  user_id:       string
  email:         string
  role:          'student' | 'admin'
  full_name:     string | null
  created_at:    string
  subject_count: number
  task_count:    number
}

export default function AdminPanel() {
  const { userProfile } = useAuth()
  const [users, setUsers]       = useState<UserStats[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState<string | null>(null)   // user_id being saved

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = getSupabase()
    if (!sb) { setError('Supabase не настроен'); setLoading(false); return }

    const { data, error: rpcErr } = await sb.rpc('get_user_stats_for_admin')
    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      setUsers((data as UserStats[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleRoleChange(targetId: string, newRole: 'student' | 'admin') {
    setSaving(targetId)
    setError(null)
    const sb = getSupabase()
    if (!sb) { setSaving(null); return }

    const { error: rpcErr } = await sb.rpc('set_user_role', {
      target_user_id: targetId,
      new_role:       newRole,
    })

    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      setUsers(prev =>
        prev.map(u => u.user_id === targetId ? { ...u, role: newRole } : u)
      )
    }
    setSaving(null)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Загрузка пользователей…
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div style={{
          background: 'var(--danger-light)', border: '1px solid var(--danger)',
          borderRadius: 6, padding: '8px 12px', fontSize: 12,
          color: 'var(--danger)', marginBottom: 12,
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Всего пользователей: {users.length}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          ↻ Обновить
        </button>
      </div>

      {users.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Нет пользователей</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(user => (
            <div
              key={user.user_id}
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {/* Top row: email + role badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                  flex: 1,
                }}>
                  {user.email}
                  {user.user_id === userProfile?.id && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      (вы)
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                  background: user.role === 'admin' ? 'var(--accent)' : 'var(--bg-panel)',
                  color: user.role === 'admin' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}>
                  {user.role === 'admin' ? 'Администратор' : 'Студент'}
                </span>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                {user.full_name && (
                  <span>{user.full_name}</span>
                )}
                <span>📅 {formatDate(user.created_at)}</span>
                <span>📚 {user.subject_count} предм.</span>
                <span>📋 {user.task_count} зад.</span>
              </div>

              {/* Role change — disabled for current user */}
              {user.user_id !== userProfile?.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Роль:</span>
                  <select
                    className="form-select"
                    style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
                    value={user.role}
                    disabled={saving === user.user_id}
                    onChange={(e) =>
                      void handleRoleChange(user.user_id, e.target.value as 'student' | 'admin')
                    }
                  >
                    <option value="student">Студент</option>
                    <option value="admin">Администратор</option>
                  </select>
                  {saving === user.user_id && (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Сохраняем…</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
