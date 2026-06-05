import { useState, useEffect } from 'react'
import type { WalletCategory, WalletTransaction, WalletTransactionType } from '../types'

interface Props {
  transaction?: WalletTransaction | null
  categories:   WalletCategory[]
  onSave:       (data: Pick<WalletTransaction, 'category_id' | 'amount' | 'type' | 'note' | 'date'>) => Promise<void>
  onClose:      () => void
}

export default function WalletTransactionForm({ transaction, categories, onSave, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const [type,       setType]       = useState<WalletTransactionType>(transaction?.type ?? 'expense')
  const [amount,     setAmount]     = useState(transaction ? String(transaction.amount) : '')
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.category_id ?? null)
  const [note,       setNote]       = useState(transaction?.note ?? '')
  const [date,       setDate]       = useState(transaction?.date ?? today)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const filteredCats = categories.filter((c) => c.type === type)

  // Reset category when type changes
  useEffect(() => {
    if (categoryId !== null) {
      const cat = categories.find((c) => c.id === categoryId)
      if (cat && cat.type !== type) setCategoryId(null)
    }
  }, [type, categoryId, categories])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Введите сумму больше нуля'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ category_id: categoryId, amount: amt, type, note: note.trim() || null, date })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{transaction ? 'Изменить запись' : 'Новая запись'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm${type === 'expense' ? ' btn-primary' : ' btn-ghost'}`}
              style={type === 'expense' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}
              onClick={() => setType('expense')}
            >
              − Расход
            </button>
            <button
              type="button"
              className={`btn btn-sm${type === 'income' ? ' btn-primary' : ' btn-ghost'}`}
              style={type === 'income' ? { background: '#22c55e', borderColor: '#22c55e' } : {}}
              onClick={() => setType('income')}
            >
              + Доход
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="form-label">Сумма *</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="form-label">Категория</label>
            <select
              className="form-select"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Без категории —</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="form-label">Дата</label>
            <input
              className="form-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Note */}
          <div>
            <label className="form-label">Заметка</label>
            <input
              className="form-input"
              type="text"
              placeholder="Необязательно"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
