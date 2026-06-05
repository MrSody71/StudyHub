import { useState } from 'react'
import type { WalletCategory, WalletTransactionType } from '../types'

interface Props {
  categories: WalletCategory[]
  onCreate:   (data: Omit<WalletCategory, 'id' | 'created_at' | 'is_deleted' | 'updated_at'>) => Promise<void>
  onUpdate:   (id: number, data: Partial<Omit<WalletCategory, 'id' | 'created_at'>>) => Promise<void>
  onDelete:   (id: number) => Promise<void>
}

const DEFAULT_ICONS = ['💰','🍔','🚌','🎮','📚','🏠','👕','💊','📱','🛒','🎓','💼','🎁','💳','✈️','🍕','☕','🎵','🏋️','💅']

export default function WalletCategories({ categories, onCreate, onUpdate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [name,     setName]     = useState('')
  const [icon,     setIcon]     = useState('💰')
  const [color,    setColor]    = useState('#6366f1')
  const [type,     setType]     = useState<WalletTransactionType>('expense')
  const [saving,   setSaving]   = useState(false)

  function openCreate() {
    setEditId(null); setName(''); setIcon('💰'); setColor('#6366f1'); setType('expense')
    setShowForm(true)
  }

  function openEdit(cat: WalletCategory) {
    setEditId(cat.id); setName(cat.name); setIcon(cat.icon); setColor(cat.color); setType(cat.type)
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editId !== null) {
        await onUpdate(editId, { name: name.trim(), icon, color, type })
      } else {
        const maxSort = categories.filter((c) => c.type === type).length
        await onCreate({ name: name.trim(), icon, color, type, sort_order: maxSort + 1 })
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const expenses = categories.filter((c) => c.type === 'expense')
  const incomes  = categories.filter((c) => c.type === 'income')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Управление категориями</span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Добавить</button>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['expense', 'income'] as WalletTransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn-sm${type === t ? ' btn-primary' : ' btn-ghost'}`}
                style={type === t ? { background: t === 'expense' ? '#ef4444' : '#22c55e', borderColor: t === 'expense' ? '#ef4444' : '#22c55e' } : {}}
                onClick={() => setType(t)}
              >
                {t === 'expense' ? '− Расход' : '+ Доход'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 38, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--bg-input)' }}
              title="Цвет категории"
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_ICONS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                style={{
                  width: 36, height: 36, fontSize: 18, border: '2px solid',
                  borderColor: icon === em ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 8, background: icon === em ? 'var(--accent-light)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {em}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Отмена</button>
            <button className="btn btn-primary btn-sm" disabled={saving || !name.trim()} onClick={() => void handleSave()}>
              {saving ? 'Сохранение…' : editId ? 'Обновить' : 'Создать'}
            </button>
          </div>
        </div>
      )}

      {[{ label: 'Расходы', items: expenses }, { label: 'Доходы', items: incomes }].map(({ label, items }) => (
        <div key={label}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {label}
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Нет категорий</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 10px', background: 'var(--bg-hover)',
                    border: '1px solid var(--border)', borderRadius: 8,
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: cat.color + '20', flexShrink: 0,
                  }}>
                    {cat.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{cat.name}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(cat)} title="Изменить">✎</button>
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => void onDelete(cat.id)}
                    title="Удалить"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
