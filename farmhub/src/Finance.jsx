import { useState } from 'react'
import { fmtDate, money, useApi } from './api'
import SaleCostsModal from './SaleCostsModal'
import { useT } from './i18n'
import { ErrorNote, Loading, PageHeader, SeasonBadge } from './Widgets'

const PERIODS = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']]
const COLORS = { gross: '#294d35', net: '#6fa86f', profit: '#d9a227' }

const short = (n) => {
  const a = Math.abs(n)
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `₹${Math.round(n)}`
}

function niceMax(v) {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp
}

const tick = (label, period) => (period === 'yearly' ? label : label.split(' ')[0])

// Grouped bar chart drawn in SVG (no chart library needed).
function BarChart({ rows, series, period }) {
  const max = niceMax(Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s.key] || 0))))
  const band = 64
  const left = 58
  const W = Math.max(520, left + rows.length * band + 10)
  const H = 240
  const top = 12
  const bottom = 34
  const plot = H - top - bottom
  const bw = Math.min(16, (band - 18) / series.length)
  const y = (v) => top + plot - (Math.max(0, v) / max) * plot
  return (
    <div className="fx-chart-scroll">
      <svg className="fx-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
        aria-label={`${series.map((s) => s.label).join(', ')} by ${period} period`}>
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - 6} y1={y(max * f)} y2={y(max * f)} className="fx-grid" />
            <text x={left - 8} y={y(max * f) + 4} textAnchor="end" className="fx-axis">{short(max * f)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = left + i * band + (band - bw * series.length) / 2
          return (
            <g key={r.label}>
              {series.map((s, j) => (
                <rect key={s.key} x={x0 + j * bw} y={y(r[s.key] || 0)} width={bw - 2}
                  height={Math.max(0, top + plot - y(r[s.key] || 0))} fill={s.color} rx="2">
                  <title>{`${r.label} · ${s.label}: ${money(r[s.key] || 0)}`}</title>
                </rect>
              ))}
              <text x={left + i * band + band / 2} y={H - 12} textAnchor="middle" className="fx-axis">{tick(r.label, period)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Legend({ series }) {
  const tr = useT()
  return (
    <div className="fx-legend">
      {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{tr(s.label)}</span>)}
    </div>
  )
}

function Kpi({ label, value, hint, tone }) {
  const tr = useT()
  return (
    <div className={`fx-kpi ${tone || ''}`}>
      <small>{tr(label)}</small>
      <strong>{value}</strong>
      {hint && <span>{tr(hint)}</span>}
    </div>
  )
}

export default function Finance({ role, rk, refresh }) {
  const tr = useT()
  const isFarmer = role === 'farmer'
  const [period, setPeriod] = useState('monthly')
  const [year, setYear] = useState('')
  const [editing, setEditing] = useState(null)
  const path = `/api/finance?period=${period}${year && period !== 'yearly' ? `&year=${year}` : ''}`
  const { data, error, loading, reload } = useApi(path, rk)

  return (
    <div className="fx-page">
      <PageHeader
        kicker={isFarmer ? tr('FINANCIAL DASHBOARD') : tr('SPENDING DASHBOARD')}
        title={isFarmer ? tr('Your earnings') : tr('Your purchases')}
        sub={isFarmer
          ? tr('Only completed sales are counted. See every deduction between the sale price and the money in your bank.')
          : tr('Orders accepted by farmers count as spending.')}
        action={
          <div className="fx-controls">
            <div className="fx-segment" role="group" aria-label={tr('Period')}>
              {PERIODS.map(([id, label]) => (
                <button key={id} className={period === id ? 'active' : ''} aria-pressed={period === id} onClick={() => setPeriod(id)}>{tr(label)}</button>
              ))}
            </div>
            {period !== 'yearly' && data?.years?.length > 0 && (
              <select aria-label={tr('Year')} value={year || data.year} onChange={(e) => setYear(e.target.value)}>
                {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        }
      />
      {loading && !data && <Loading what="finances" />}
      <ErrorNote error={error} onRetry={reload} />
      {data && (isFarmer
        ? <FarmerFinance data={data} onEdit={setEditing} />
        : <BuyerFinance data={data} />)}
      {editing && (
        <SaleCostsModal order={editing} mode="edit" onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); refresh?.() }} />
      )}
    </div>
  )
}

function FarmerFinance({ data, onEdit }) {
  const tr = useT()
  const t = data.totals
  const scope = data.period === 'yearly' ? tr('all years') : String(data.year)
  const steps = [
    ['Platform fee', t.deductions.platform_fee, tr('{p}% of each sale', { p: data.platform_fee_percent })],
    ['Transport / freight', t.deductions.transport],
    ['Packaging', t.deductions.packaging],
    ['Loading & labour', t.deductions.labour],
    ['Other deductions', t.deductions.other],
  ]
  const pct = (v) => (t.gross_sales ? Math.max(1.5, (v / t.gross_sales) * 100) : 0)
  const series = [
    { key: 'gross_sales', label: 'Gross sales', color: COLORS.gross },
    { key: 'net_received', label: 'Received in bank', color: COLORS.net },
    { key: 'gross_profit', label: 'Gross profit', color: COLORS.profit },
  ]

  return (
    <>
      <div className="fx-kpis">
        <Kpi label={tr('Gross sales ({scope})', { scope })} value={money(t.gross_sales)} hint={tr('{n} completed sales', { n: t.orders })} />
        <Kpi label="Total deductions" value={`− ${money(t.deductions_total)}`} hint="Fees and selling costs" tone="bad" />
        <Kpi label="Received in bank" value={money(t.net_received)} hint="After all deductions" tone="good" />
        <Kpi label="Gross profit" value={money(t.gross_profit)} hint={tr('{p}% margin on sales', { p: t.margin_percent })} tone="gold" />
        <Kpi label="Net profit" value={money(t.net_profit)} hint="Bank amount − production cost" />
      </div>

      {(data.escrow_held > 0 || data.escrow_released_on_pickup > 0) && (
        <div className="fx-escrow-strip">
          <span>🔒 <strong>{money(data.escrow_held)}</strong> {tr('held safely in escrow (buyers have paid, released on pickup and delivery)')}</span>
          {data.escrow_released_on_pickup > 0 && <span>🚚 <strong>{money(data.escrow_released_on_pickup)}</strong> {tr('already released at pickup (70%)')}</span>}
        </div>
      )}
      {(data.missing_cost_orders > 0 || data.pipeline_value > 0) && (
        <div className="fx-notes">
          {data.pipeline_value > 0 && <p>⏳ {tr('{amount} more is on the way from pending, accepted and in-transit orders (not counted yet).', { amount: money(data.pipeline_value) })}</p>}
          {data.missing_cost_orders > 0 && (
            <p>⚠️ {tr('{n} sales have no production cost, so gross profit may look higher than it is. Use “Edit costs” below.', { n: data.missing_cost_orders })}</p>
          )}
        </div>
      )}

      <div className="fx-two">
        <section className="fh-card">
          <h3>{tr('Where your money went')}</h3>
          <p className="fh-hint">{tr('From sale price to the amount credited to your bank.')}</p>
          <div className="fx-waterfall">
            <div className="fx-wf-row">
              <span>{tr('Gross sales')}</span>
              <div className="fx-wf-track"><i className="fx-wf-gross" style={{ width: t.gross_sales ? '100%' : 0 }} /></div>
              <strong>{money(t.gross_sales)}</strong>
            </div>
            {steps.map(([label, v, hint]) => (
              <div className="fx-wf-row" key={label}>
                <span>− {tr(label)}{hint && <small>{hint}</small>}</span>
                <div className="fx-wf-track"><i className="fx-wf-cut" style={{ width: v ? `${pct(v)}%` : 0 }} /></div>
                <strong className="fx-neg">{v ? `− ${money(v)}` : '₹0'}</strong>
              </div>
            ))}
            <div className="fx-wf-row fx-wf-total">
              <span>= {tr('Received in bank')}</span>
              <div className="fx-wf-track"><i className="fx-wf-net" style={{ width: t.gross_sales ? `${(t.net_received / t.gross_sales) * 100}%` : 0 }} /></div>
              <strong>{money(t.net_received)}</strong>
            </div>
          </div>
          <dl className="fx-breakdown">
            <div><dt>{tr('Production cost (seeds, fertiliser, farm labour)')}</dt><dd>− {money(t.production_cost)}</dd></div>
            <div className="fx-breakdown-total"><dt>{tr('Net profit')}</dt><dd>{money(t.net_profit)}</dd></div>
            <div className="fx-breakdown-sub"><dt>{tr('Gross profit = gross sales − production cost')}</dt><dd>{money(t.gross_profit)}</dd></div>
          </dl>
        </section>

        <section className="fh-card">
          <h3>{tr('Crops you sold the most')}</h3>
          {data.top_crops.length === 0 && <p className="fh-hint">{tr('No completed sales in this period.')}</p>}
          <div className="fx-rank">
            {data.top_crops.map((c, i) => (
              <div key={c.name} className="fx-rank-row">
                <span className="fx-rank-n">{i + 1}</span>
                <div className="fx-rank-main">
                  <strong>{c.name}</strong>
                  <small>{c.quantity.toLocaleString('en-IN')} {tr(c.unit)} · {tr('{n} sales', { n: c.orders })} · {money(c.net_received)} {tr('to bank')}</small>
                  <div className="fx-wf-track"><i className="fx-wf-gross" style={{ width: `${(c.gross_sales / data.top_crops[0].gross_sales) * 100}%` }} /></div>
                </div>
                <strong>{money(c.gross_sales)}</strong>
              </div>
            ))}
          </div>
          {data.by_season.length > 0 && (
            <>
              <h4 className="fx-subhead">{tr('By crop season')}</h4>
              <div className="fx-season-split">
                {data.by_season.map((s) => (
                  <div key={s.season}>
                    <SeasonBadge season={s.season} />
                    <strong>{money(s.gross_sales)}</strong>
                    <small>{tr('Gross profit')} {money(s.gross_profit)} · {tr('bank')} {money(s.net_received)}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="fh-card fx-wide">
        <div className="fx-card-head">
          <h3>{tr(data.period === 'monthly' ? 'Month by month' : data.period === 'quarterly' ? 'Quarter by quarter' : 'Year by year')}</h3>
          <Legend series={series} />
        </div>
        <BarChart rows={data.periods} series={series} period={data.period} />
        <div className="fx-table-wrap">
          <table className="fx-table">
            <thead>
              <tr><th>{tr('Period')}</th><th>{tr('Sales')}</th><th>{tr('Gross sales')}</th><th>{tr('Deductions')}</th><th>{tr('Received in bank')}</th><th>{tr('Production cost')}</th><th>{tr('Gross profit')}</th></tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.label} className={p.orders ? '' : 'fx-muted'}>
                  <td>{p.label}</td>
                  <td>{p.orders}</td>
                  <td>{money(p.gross_sales)}</td>
                  <td>{p.deductions_total ? `− ${money(p.deductions_total)}` : '₹0'}</td>
                  <td><strong>{money(p.net_received)}</strong></td>
                  <td>{money(p.production_cost)}</td>
                  <td>{money(p.gross_profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{tr('Total')}</td><td>{t.orders}</td><td>{money(t.gross_sales)}</td><td>− {money(t.deductions_total)}</td>
                <td><strong>{money(t.net_received)}</strong></td><td>{money(t.production_cost)}</td><td>{money(t.gross_profit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="fh-card fx-wide">
        <h3>{tr('Completed sales ({n})', { n: data.orders.length })}</h3>
        <p className="fh-hint">{tr('Add transport, packaging or production costs to any sale to keep these numbers accurate.')}</p>
        <div className="fx-table-wrap">
          <table className="fx-table">
            <thead>
              <tr><th>{tr('Date')}</th><th>{tr('Crop')}</th><th>{tr('Buyer')}</th><th>{tr('Sale')}</th><th>{tr('Deductions')}</th><th>{tr('To bank')}</th><th>{tr('Production cost')}</th><th /></tr>
            </thead>
            <tbody>
              {data.orders.map((o) => {
                const ded = Object.values(o.deductions).reduce((a, b) => a + b, 0)
                return (
                  <tr key={o.id}>
                    <td>{fmtDate(o.completed_at || o.created_at)}</td>
                    <td>{o.product_name} <small>{o.quantity} {o.unit}</small> <SeasonBadge season={o.season} /></td>
                    <td>{o.buyer_name}</td>
                    <td>{money(o.total_price)}</td>
                    <td>− {money(ded)}</td>
                    <td><strong>{money(o.net_payout)}</strong></td>
                    <td>{o.unit_cost == null ? <span className="fx-warn">{tr('Not added')}</span> : money(o.production_cost)}</td>
                    <td><button className="fx-link-btn" onClick={() => onEdit(o)}>{tr('Edit costs')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function BuyerFinance({ data }) {
  const tr = useT()
  const t = data.totals
  const series = [{ key: 'spent', label: 'Spent', color: COLORS.gross }]
  return (
    <>
      <div className="fx-kpis">
        <Kpi label={tr('Total spent ({scope})', { scope: data.period === 'yearly' ? tr('all years') : data.year })} value={money(t.spent)} tone="good" />
        <Kpi label="Orders" value={t.orders} hint="Accepted, in transit or completed" />
        <Kpi label="Quantity bought" value={t.quantity.toLocaleString('en-IN')} hint="All units combined" />
        <Kpi label="Awaiting farmer" value={money(data.pending_value)} hint="Pending orders, not counted yet" />
      </div>
      <div className="fx-two">
        <section className="fh-card">
          <h3>{tr('What you buy the most')}</h3>
          {data.top_crops.length === 0 && <p className="fh-hint">{tr('No purchases in this period.')}</p>}
          <div className="fx-rank">
            {data.top_crops.map((c, i) => (
              <div key={c.name} className="fx-rank-row">
                <span className="fx-rank-n">{i + 1}</span>
                <div className="fx-rank-main">
                  <strong>{c.name}</strong>
                  <small>{c.quantity.toLocaleString('en-IN')} {tr(c.unit)} · {tr('avg')} {money(c.avg_price)}/{tr(c.unit)} · {tr('{n} orders', { n: c.orders })}</small>
                  <div className="fx-wf-track"><i className="fx-wf-gross" style={{ width: `${(c.spent / data.top_crops[0].spent) * 100}%` }} /></div>
                </div>
                <strong>{money(c.spent)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="fh-card">
          <h3>{tr('By crop season')}</h3>
          {data.by_season.length === 0 && <p className="fh-hint">{tr('No purchases in this period.')}</p>}
          <div className="fx-season-split">
            {data.by_season.map((s) => (
              <div key={s.season}>
                <SeasonBadge season={s.season} />
                <strong>{money(s.spent)}</strong>
                <small>{tr('{n} orders', { n: s.orders })}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="fh-card fx-wide">
        <div className="fx-card-head">
          <h3>{tr('Spending over time')}</h3>
          <Legend series={series} />
        </div>
        <BarChart rows={data.periods} series={series} period={data.period} />
      </section>
    </>
  )
}
