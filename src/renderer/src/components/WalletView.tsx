import { useState, useEffect, useCallback } from 'react'
import type { WalletCategory, WalletTransaction, WalletStats } from '../types'
import WalletTransactionForm from './WalletTransactionForm'
import WalletCategories from './WalletCategories'
import WalletStatsView from './WalletStats'

type Tab = 'transactions' | 'stats' | 'categories'

type Period = 'month' | '3months' | 'year' | 'all'

function getPeriodDates(period: Period): { dateFrom?: string; dateTo?: string } {
  if (period === 'all') return {}
  const now  = new Date()
  const to   = now.toISOString().slice(0, 10)
  const from = new Date(now)
  if (period === 'month')   from.setMonth(from.getMonth() - 1)
  if (period === '3months') from.setMonth(from.getMonth() - 3)
  if (period === 'year')    from.setFullYear(from.getFullYear() - 1)
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to }
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function WalletView() {
  const [tab,          setTab]          = useState<Tab>('transactions')
  const [period,       setPeriod]       = useState<Period>('month')
  const [categories,   setCategories]   = useState<WalletCategory[]>([])
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [stats,        setStats]        = useState<WalletStats | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showForm,     setShowForm]     = useState(false)
  const [editTx,       setEditTx]       = useState<WalletTransaction | null>(null)

  const loadCategories = useCallback(async () => {
    const res = await window.api.wallet.getCategories()
    if (!res.success) return
    // Seed default categories on first use (web version — desktop seeds via migration)
    if (res.data.length === 0) {
      const defaults: Omit<import('../types').WalletCategory, 'id' | 'created_at' | 'is_deleted' | 'updated_at'>[] = [
        { name: 'Еда',         icon: '🍔', color: '#f97316', type: 'expense', sort_order: 1  },
        { name: 'Транспорт',   icon: '🚌', color: '#3b82f6', type: 'expense', sort_order: 2  },
        { name: 'Развлечения', icon: '🎮', color: '#a855f7', type: 'expense', sort_order: 3  },
        { name: 'Учёба',       icon: '📚', color: '#6366f1', type: 'expense', sort_order: 4  },
        { name: 'Жильё',       icon: '🏠', color: '#22c55e', type: 'expense', sort_order: 5  },
        { name: 'Одежда',      icon: '👕', color: '#ec4899', type: 'expense', sort_order: 6  },
        { name: 'Здоровье',    icon: '💊', color: '#14b8a6', type: 'expense', sort_order: 7  },
        { name: 'Связь',       icon: '📱', color: '#06b6d4', type: 'expense', sort_order: 8  },
        { name: 'Другое',      icon: '🛒', color: '#94a3b8', type: 'expense', sort_order: 9  },
        { name: 'Стипендия',   icon: '🎓', color: '#eab308', type: 'income',  sort_order: 1  },
        { name: 'Работа',      icon: '💼', color: '#3b82f6', type: 'income',  sort_order: 2  },
        { name: 'Подарок',     icon: '🎁', color: '#ec4899', type: 'income',  sort_order: 3  },
        { name: 'Прочее',      icon: '💳', color: '#94a3b8', type: 'income',  sort_order: 4  },
      ]
      await Promise.all(defaults.map((d) => window.api.wallet.createCategory(d)))
      const seeded = await window.api.wallet.getCategories()
      if (seeded.success) setCategories(seeded.data)
    } else {
      setCategories(res.data)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filter = getPeriodDates(period)
    const [txRes, statsRes] = await Promise.all([
      window.api.wallet.getTransactions(filter),
      window.api.wallet.getStats(filter),
    ])
    if (!txRes.success) { setError(txRes.error); setLoading(false); return }
    if (!statsRes.success) { setError(statsRes.error); setLoading(false); return }
    setTransactions(txRes.data)
    setStats(statsRes.data)
    setLoading(false)
  }, [period])

  useEffect(() => { void loadCategories() }, [loadCategories])
  useEffect(() => { void loadData() }, [loadData])

  async function handleCreateTx(data: Pick<WalletTransaction, 'category_id' | 'amount' | 'type' | 'note' | 'date'>) {
    const res = await window.api.wallet.createTransaction(data)
    if (!res.success) throw new Error(res.error)
    await loadData()
  }

  async function handleUpdateTx(data: Pick<WalletTransaction, 'category_id' | 'amount' | 'type' | 'note' | 'date'>) {
    if (!editTx) return
    const res = await window.api.wallet.updateTransaction(editTx.id, data)
    if (!res.success) throw new Error(res.error)
    setEditTx(null)
    await loadData()
  }

  async function handleDeleteTx(id: number) {
    if (!confirm('Удалить эту запись?')) return
    await window.api.wallet.deleteTransaction(id)
    await loadData()
  }

  async function handleCreateCategory(data: Omit<WalletCategory, 'id' | 'created_at' | 'is_deleted' | 'updated_at'>) {
    const res = await window.api.wallet.createCategory(data)
    if (!res.success) throw new Error(res.error)
    await loadCategories()
  }

  async function handleUpdateCategory(id: number, data: Partial<Omit<WalletCategory, 'id' | 'created_at'>>) {
    const res = await window.api.wallet.updateCategory(id, data)
    if (!res.success) throw new Error(res.error)
    await loadCategories()
  }

  async function handleDeleteCategory(id: number) {
    if (!confirm('Удалить категорию? Транзакции без категории не удаляются.')) return
    const res = await window.api.wallet.deleteCategory(id)
    if (!res.success) throw new Error(res.error)
    await loadCategories()
    await loadData()
  }

  async function handleExportCsv() {
    const filter = getPeriodDates(period)
    const res = await window.api.wallet.exportCsv(filter)
    if (!res.success) { alert('Ошибка экспорта: ' + res.error); return }
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `wallet_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Group transactions by date
  const grouped = transactions.reduce<{ date: string; items: WalletTransaction[] }[]>((acc, tx) => {
    const last = acc[acc.length - 1]
    if (last && last.date === tx.date) last.items.push(tx)
    else acc.push({ date: tx.date, items: [tx] })
    return acc
  }, [])

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'month',   label: 'Месяц' },
    { key: '3months', label: '3 мес.' },
    { key: 'year',    label: 'Год' },
    { key: 'all',     label: 'Всё' },
  ]

  return (
    <div className="wallet-view">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="wallet-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            💳 Кошелёк
          </h2>
          {stats && (
            <span style={{
              fontSize: 13, padding: '2px 10px', borderRadius: 12,
              background: stats.balance >= 0 ? '#22c55e15' : '#ef444415',
              color: stats.balance >= 0 ? '#22c55e' : '#ef4444',
              border: `1px solid ${stats.balance >= 0 ? '#22c55e40' : '#ef444440'}`,
              fontWeight: 600,
            }}>
              {stats.balance >= 0 ? '+' : ''}{fmt(stats.balance)} ₽
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`btn btn-sm${period === p.key ? ' btn-primary' : ' btn-ghost'}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void handleExportCsv()} title="Экспорт CSV">
            ↓ CSV
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setEditTx(null); setShowForm(true) }}
          >
            + Запись
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="subject-tab-bar" style={{ marginBottom: 0 }}>
        {([
          { key: 'transactions', label: '📋 Записи'   },
          { key: 'stats',        label: '📊 Статистика' },
          { key: 'categories',   label: '🏷 Категории'  },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            className={`subject-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-light)', border: '1px solid var(--danger)',
          borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--danger)', marginTop: 12,
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {/* ── Transactions tab ──────────────────────────────────────────────── */}
        {tab === 'transactions' && (
          <div>
            {loading ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Загрузка…</div>
            ) : grouped.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '32px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
                Нет записей за выбранный период.<br />
                Нажмите «+ Запись» чтобы добавить первую.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {grouped.map(({ date, items }) => {
                  const dayIncome  = items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
                  const dayExpense = items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                  return (
                    <div key={date}>
                      {/* Day header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '4px 0', borderBottom: '1px solid var(--border)', marginBottom: 6,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {formatDate(date)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {dayIncome  > 0 && <span style={{ color: '#22c55e' }}>+{fmt(dayIncome)} </span>}
                          {dayExpense > 0 && <span style={{ color: '#ef4444' }}>-{fmt(dayExpense)}</span>}
                        </span>
                      </div>

                      {/* Transaction rows */}
                      {items.map((tx) => (
                        <div
                          key={tx.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: '50%', fontSize: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: (tx.category_color ?? '#94a3b8') + '20',
                            flexShrink: 0,
                          }}>
                            {tx.category_icon ?? '💳'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                              {tx.category_name ?? 'Без категории'}
                            </div>
                            {tx.note && (
                              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {tx.note}
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 14, fontWeight: 700,
                            color: tx.type === 'income' ? '#22c55e' : '#ef4444',
                            flexShrink: 0,
                          }}>
                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => { setEditTx(tx); setShowForm(true) }}
                              title="Изменить"
                            >✎</button>
                            <button
                              className="btn btn-ghost btn-xs"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => void handleDeleteTx(tx.id)}
                              title="Удалить"
                            >✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Stats tab ─────────────────────────────────────────────────────── */}
        {tab === 'stats' && (
          loading ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Загрузка…</div>
          ) : stats ? (
            <WalletStatsView stats={stats} />
          ) : null
        )}

        {/* ── Categories tab ────────────────────────────────────────────────── */}
        {tab === 'categories' && (
          <WalletCategories
            categories={categories}
            onCreate={handleCreateCategory}
            onUpdate={handleUpdateCategory}
            onDelete={handleDeleteCategory}
          />
        )}
      </div>

      {/* ── Transaction form modal ────────────────────────────────────────── */}
      {showForm && (
        <WalletTransactionForm
          transaction={editTx}
          categories={categories}
          onSave={editTx ? handleUpdateTx : handleCreateTx}
          onClose={() => { setShowForm(false); setEditTx(null) }}
        />
      )}
    </div>
  )
}
