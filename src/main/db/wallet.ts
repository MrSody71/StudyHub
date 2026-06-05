import { getDb } from './database'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export interface WalletCategoryRow {
  id:         number
  name:       string
  icon:       string
  color:      string
  type:       'income' | 'expense'
  sort_order: number
  is_deleted: number
  updated_at: string
  created_at: string
}

export interface WalletTransactionRow {
  id:             number
  category_id:    number | null
  amount:         number
  type:           'income' | 'expense'
  note:           string | null
  date:           string
  is_deleted:     number
  updated_at:     string
  created_at:     string
  category_name?:  string | null
  category_icon?:  string | null
  category_color?: string | null
}

export interface WalletStatsResult {
  totalIncome:  number
  totalExpense: number
  balance:      number
  byCategory: {
    category_id:    number | null
    category_name:  string
    category_icon:  string
    category_color: string
    type:           'income' | 'expense'
    total:          number
    count:          number
  }[]
  byDay: { date: string; income: number; expense: number }[]
}

// ── Categories ────────────────────────────────────────────────────────────────

export function getWalletCategories(): WalletCategoryRow[] {
  return getDb()
    .prepare('SELECT * FROM wallet_categories WHERE is_deleted = 0 ORDER BY type, sort_order, name')
    .all() as WalletCategoryRow[]
}

export function createWalletCategory(
  data: Pick<WalletCategoryRow, 'name' | 'icon' | 'color' | 'type' | 'sort_order'>
): WalletCategoryRow {
  const db = getDb()
  const result = db
    .prepare(`
      INSERT INTO wallet_categories (name, icon, color, type, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ${NOW})
    `)
    .run(data.name, data.icon, data.color, data.type, data.sort_order)
  return db.prepare('SELECT * FROM wallet_categories WHERE id = ?')
    .get(result.lastInsertRowid) as WalletCategoryRow
}

export function updateWalletCategory(
  id: number,
  data: Partial<Pick<WalletCategoryRow, 'name' | 'icon' | 'color' | 'type' | 'sort_order'>>
): WalletCategoryRow {
  const db = getDb()
  const fields = [`updated_at = ${NOW}`]
  const values: unknown[] = []
  if (data.name       !== undefined) { fields.push('name = ?');       values.push(data.name) }
  if (data.icon       !== undefined) { fields.push('icon = ?');       values.push(data.icon) }
  if (data.color      !== undefined) { fields.push('color = ?');      values.push(data.color) }
  if (data.type       !== undefined) { fields.push('type = ?');       values.push(data.type) }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order) }
  values.push(id)
  db.prepare(`UPDATE wallet_categories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM wallet_categories WHERE id = ?').get(id) as WalletCategoryRow
}

export function deleteWalletCategory(id: number): void {
  getDb()
    .prepare(`UPDATE wallet_categories SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

// ── Transactions ──────────────────────────────────────────────────────────────

export function getWalletTransactions(filter?: {
  dateFrom?: string
  dateTo?:   string
  type?:     'income' | 'expense'
  limit?:    number
}): WalletTransactionRow[] {
  const conditions = ['t.is_deleted = 0']
  const values: unknown[] = []

  if (filter?.dateFrom) { conditions.push('t.date >= ?'); values.push(filter.dateFrom) }
  if (filter?.dateTo)   { conditions.push('t.date <= ?'); values.push(filter.dateTo) }
  if (filter?.type)     { conditions.push('t.type = ?');  values.push(filter.type) }

  const limit = filter?.limit ? `LIMIT ${filter.limit}` : ''

  return getDb()
    .prepare(`
      SELECT
        t.*,
        c.name  AS category_name,
        c.icon  AS category_icon,
        c.color AS category_color
      FROM wallet_transactions t
      LEFT JOIN wallet_categories c ON c.id = t.category_id AND c.is_deleted = 0
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.date DESC, t.id DESC
      ${limit}
    `)
    .all(...values) as WalletTransactionRow[]
}

export function createWalletTransaction(
  data: Pick<WalletTransactionRow, 'category_id' | 'amount' | 'type' | 'note' | 'date'>
): WalletTransactionRow {
  const db = getDb()
  const result = db
    .prepare(`
      INSERT INTO wallet_transactions (category_id, amount, type, note, date, updated_at)
      VALUES (?, ?, ?, ?, ?, ${NOW})
    `)
    .run(data.category_id ?? null, data.amount, data.type, data.note ?? null, data.date)
  const row = db
    .prepare(`
      SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
      FROM wallet_transactions t
      LEFT JOIN wallet_categories c ON c.id = t.category_id AND c.is_deleted = 0
      WHERE t.id = ?
    `)
    .get(result.lastInsertRowid) as WalletTransactionRow
  return row
}

export function updateWalletTransaction(
  id: number,
  data: Partial<Pick<WalletTransactionRow, 'category_id' | 'amount' | 'type' | 'note' | 'date'>>
): WalletTransactionRow {
  const db = getDb()
  const fields = [`updated_at = ${NOW}`]
  const values: unknown[] = []
  if (data.category_id !== undefined) { fields.push('category_id = ?'); values.push(data.category_id ?? null) }
  if (data.amount      !== undefined) { fields.push('amount = ?');      values.push(data.amount) }
  if (data.type        !== undefined) { fields.push('type = ?');        values.push(data.type) }
  if (data.note        !== undefined) { fields.push('note = ?');        values.push(data.note ?? null) }
  if (data.date        !== undefined) { fields.push('date = ?');        values.push(data.date) }
  values.push(id)
  db.prepare(`UPDATE wallet_transactions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return db
    .prepare(`
      SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
      FROM wallet_transactions t
      LEFT JOIN wallet_categories c ON c.id = t.category_id AND c.is_deleted = 0
      WHERE t.id = ?
    `)
    .get(id) as WalletTransactionRow
}

export function deleteWalletTransaction(id: number): void {
  getDb()
    .prepare(`UPDATE wallet_transactions SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getWalletStats(filter?: { dateFrom?: string; dateTo?: string }): WalletStatsResult {
  const db = getDb()
  const conditions = ['t.is_deleted = 0']
  const values: unknown[] = []
  if (filter?.dateFrom) { conditions.push('t.date >= ?'); values.push(filter.dateFrom) }
  if (filter?.dateTo)   { conditions.push('t.date <= ?'); values.push(filter.dateTo) }
  const where = conditions.join(' AND ')

  // Totals
  const totals = db
    .prepare(`
      SELECT
        SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS totalIncome,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS totalExpense
      FROM wallet_transactions t
      WHERE ${where}
    `)
    .get(...values) as { totalIncome: number | null; totalExpense: number | null }

  const totalIncome  = totals.totalIncome  ?? 0
  const totalExpense = totals.totalExpense ?? 0

  // By category
  const byCategory = db
    .prepare(`
      SELECT
        t.category_id,
        COALESCE(c.name,  'Без категории') AS category_name,
        COALESCE(c.icon,  '💳')            AS category_icon,
        COALESCE(c.color, '#94a3b8')       AS category_color,
        t.type,
        SUM(t.amount) AS total,
        COUNT(*)      AS count
      FROM wallet_transactions t
      LEFT JOIN wallet_categories c ON c.id = t.category_id AND c.is_deleted = 0
      WHERE ${where}
      GROUP BY t.category_id, t.type
      ORDER BY total DESC
    `)
    .all(...values) as WalletStatsResult['byCategory']

  // By day (last 30 days of the period or all)
  const byDayRows = db
    .prepare(`
      SELECT
        date,
        SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
      FROM wallet_transactions t
      WHERE ${where}
      GROUP BY date
      ORDER BY date ASC
    `)
    .all(...values) as WalletStatsResult['byDay']

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    byCategory,
    byDay: byDayRows,
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function exportWalletCsv(filter?: { dateFrom?: string; dateTo?: string }): string {
  const rows = getWalletTransactions(filter)
  const header = 'date,type,amount,category,note\n'
  const lines = rows.map((r) => {
    const note = (r.note ?? '').replace(/"/g, '""')
    const cat  = (r.category_name ?? '').replace(/"/g, '""')
    return `${r.date},${r.type},${r.amount},"${cat}","${note}"`
  })
  return header + lines.join('\n')
}
