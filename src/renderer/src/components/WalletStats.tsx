import type { WalletStats } from '../types'

interface Props {
  stats: WalletStats
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Simple horizontal bar for a single category row */
function CategoryBar({ name, icon, color, total, max }: { name: string; icon: string; color: string; total: number; max: number }) {
  const pct = max > 0 ? (total / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>{fmt(total)}</span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>
    </div>
  )
}

/** Pure SVG bar chart — daily income vs expense */
function DayBarChart({ byDay }: { byDay: WalletStats['byDay'] }) {
  if (byDay.length === 0) return (
    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0' }}>
      Нет данных для графика
    </div>
  )

  const W = 560, H = 120, BAR_GAP = 2
  const days = byDay.slice(-30) // last 30 days
  const maxVal = Math.max(...days.map((d) => Math.max(d.income, d.expense)), 1)
  const barW = Math.max(4, (W - BAR_GAP * (days.length - 1)) / days.length / 2 - 1)

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      style={{ width: '100%', display: 'block' }}
      aria-label="График доходов и расходов по дням"
    >
      {days.map((day, i) => {
        const x = i * ((W) / days.length)
        const incH = (day.income  / maxVal) * H
        const expH = (day.expense / maxVal) * H
        return (
          <g key={day.date}>
            {/* Income bar */}
            <rect
              x={x}
              y={H - incH}
              width={barW}
              height={incH}
              rx={2}
              fill="#22c55e"
              opacity={0.85}
            >
              <title>{day.date}: +{fmt(day.income)}</title>
            </rect>
            {/* Expense bar */}
            <rect
              x={x + barW + 1}
              y={H - expH}
              width={barW}
              height={expH}
              rx={2}
              fill="#ef4444"
              opacity={0.85}
            >
              <title>{day.date}: -{fmt(day.expense)}</title>
            </rect>
          </g>
        )
      })}
      {/* X-axis line */}
      <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={1} />
    </svg>
  )
}

export default function WalletStats({ stats }: Props) {
  const expCats = stats.byCategory.filter((c) => c.type === 'expense')
  const incCats = stats.byCategory.filter((c) => c.type === 'income')
  const maxExp  = expCats[0]?.total ?? 1
  const maxInc  = incCats[0]?.total ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={{ background: '#22c55e15', border: '1px solid #22c55e40', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Доходы</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>+{fmt(stats.totalIncome)}</div>
        </div>
        <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Расходы</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>-{fmt(stats.totalExpense)}</div>
        </div>
        <div style={{
          background: stats.balance >= 0 ? '#22c55e15' : '#ef444415',
          border: `1px solid ${stats.balance >= 0 ? '#22c55e40' : '#ef444440'}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Баланс</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: stats.balance >= 0 ? '#22c55e' : '#ef4444' }}>
            {stats.balance >= 0 ? '+' : ''}{fmt(stats.balance)}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      {stats.byDay.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            По дням
            <span style={{ marginLeft: 12, fontWeight: 400 }}>
              <span style={{ color: '#22c55e' }}>■</span> доход&nbsp;
              <span style={{ color: '#ef4444' }}>■</span> расход
            </span>
          </div>
          <DayBarChart byDay={stats.byDay} />
        </div>
      )}

      {/* Expense categories */}
      {expCats.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Расходы по категориям</div>
          {expCats.map((c) => (
            <CategoryBar key={`${c.category_id}_exp`} name={c.category_name} icon={c.category_icon} color={c.category_color} total={c.total} max={maxExp} />
          ))}
        </div>
      )}

      {/* Income categories */}
      {incCats.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Доходы по категориям</div>
          {incCats.map((c) => (
            <CategoryBar key={`${c.category_id}_inc`} name={c.category_name} icon={c.category_icon} color={c.category_color} total={c.total} max={maxInc} />
          ))}
        </div>
      )}

      {stats.byCategory.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0' }}>
          Нет данных за выбранный период
        </div>
      )}
    </div>
  )
}
