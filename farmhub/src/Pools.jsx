import { useMemo, useState } from 'react'
import { api, emojiFor, money, useApi } from './api'
import EscrowPayModal from './Escrow'
import { useT } from './i18n'
import { ErrorNote, Loading, QualityBadge, SeasonBadge } from './Widgets'

const kgFmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// Same split rule as the backend: proportional to each farmer's stock, last one takes the rest.
function splitPreview(members, want) {
  const total = members.reduce((s, m) => s + m.quantity_kg, 0)
  let left = want
  return members.map((m, i) => {
    const kg = Math.max(0, Math.min(i === members.length - 1 ? left : Math.round((want * m.quantity_kg) / total), m.quantity_kg, left))
    left -= kg
    return { ...m, kg, amount: kg * m.price_per_kg }
  })
}

function PoolOrderModal({ pool, user, onClose, onDone }) {
  const t = useT()
  const [qty, setQty] = useState(Math.min(pool.total_quantity_kg, 1000))
  const [address, setAddress] = useState(user?.address || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)
  const preview = useMemo(() => splitPreview(pool.members, Number(qty) || 0), [pool.members, qty])
  const total = preview.reduce((s, p) => s + p.amount, 0)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api(`/api/pools/${pool.id}/order`, { method: 'POST', body: { quantity_kg: Number(qty), delivery_address: address } })
      setPlaced(res)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (placed) {
    return <EscrowPayModal orders={placed.orders} title={t('Pay for your pooled order')} onClose={onClose} onPaid={onDone} />
  }

  return (
    <div className="fh-overlay" onClick={onClose}>
      <form className="fh-modal fx-pool-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>🤝 {t('{crop} pool · PIN {pin}', { crop: t(pool.crop_name), pin: pool.pincode })}</h3>
        <p className="fh-sub">{t('{n} farmers from {district} sell together. One order, one truck — each farmer is paid for their own share.', { n: pool.farmer_count, district: pool.district })}</p>
        <label htmlFor="pool-qty">{t('Quantity (kg)')}</label>
        <input id="pool-qty" type="number" min="1" max={pool.total_quantity_kg} step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        <label htmlFor="pool-address">{t('Delivery address')}</label>
        <input id="pool-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <table className="fx-split">
          <thead><tr><th>{t('Farmer')}</th><th>{t('Share')}</th><th>{t('Amount')}</th></tr></thead>
          <tbody>
            {preview.filter((p) => p.kg > 0).map((p) => (
              <tr key={p.product_id}><td>{p.farmer_name}</td><td>{kgFmt(p.kg)} kg</td><td>{money(p.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="fh-total">{t('Total')}: <strong>{money(total)}</strong> <small>({money(total / (Number(qty) || 1))}/kg)</small></div>
        {error && <div className="fh-error">{error}</div>}
        <button className="fh-submit" disabled={busy}>{busy ? t('Placing…') : t('Place pooled order')}</button>
      </form>
    </div>
  )
}

// Buyer marketplace section: village bulk lots built from neighbouring farmers' listings.
export default function PoolsSection({ user, rk, onDone }) {
  const t = useT()
  const pools = useApi('/api/pools', rk)
  const [open, setOpen] = useState(null)
  const list = pools.data || []

  return (
    <section className="fx-pools">
      <div className="fx-pools-head">
        <div>
          <span className="section-kicker">{t('MINI-FPO')}</span>
          <h3 className="fx-section-title">{t('Village bulk pools')}</h3>
          <p>{t('Small farmers in the same village PIN code pool one crop into a truckload. You order once; transport cost is shared.')}</p>
        </div>
      </div>
      {pools.loading && <Loading what="pools" />}
      <ErrorNote error={pools.error} onRetry={pools.reload} />
      {!pools.loading && list.length === 0 && <p className="fh-hint">{t('No village pools open right now.')}</p>}
      <div className="fx-pool-grid">
        {list.map((p) => (
          <article key={p.id} className={`fx-pool-card ${p.status === 'READY_FOR_TRUCK' ? 'ready' : ''}`}>
            <div className="fx-pool-top">
              <span className="fx-pool-emoji" aria-hidden="true">{emojiFor(p.category)}</span>
              <div>
                <strong>{t('{n} {district} farmers', { n: p.farmer_count, district: p.district })}</strong>
                <span>{kgFmt(p.total_quantity_kg)} kg {t(p.crop_name)} {t('pooled')}</span>
              </div>
              <SeasonBadge season={p.season} />
            </div>
            <div className="fx-pool-bar" role="progressbar" aria-valuenow={p.fill_percent} aria-valuemin={0} aria-valuemax={100}
              aria-label={t('Truck filled')}>
              <i style={{ width: `${p.fill_percent}%` }} />
            </div>
            <small className="fx-pool-fill">
              {p.status === 'READY_FOR_TRUCK' ? `🚚 ${t('Full truckload ready')}` : t('{pct}% of a {kg} kg truck', { pct: p.fill_percent, kg: kgFmt(p.target_quantity_kg) })}
              {' · '}PIN {p.pincode}
            </small>
            <ul className="fx-pool-members">
              {p.members.map((m) => (
                <li key={m.product_id}><span>{m.farmer_name}{m.farmer_rating ? <small className="fx-mini-star"> ★{m.farmer_rating}</small> : null}</span><span>{kgFmt(m.quantity_kg)} kg · {money(m.price_per_kg)}/kg</span>
                  {m.quality_grade && <QualityBadge grade={m.quality_grade} />}</li>
              ))}
            </ul>
            <div className="fx-pool-foot">
              <div><b>{money(p.avg_price_per_kg)}</b><small>/kg {t('average')}</small></div>
              <button onClick={() => setOpen(p)}>{t('Order bulk')} →</button>
            </div>
          </article>
        ))}
      </div>
      {open && <PoolOrderModal pool={open} user={user} onClose={() => setOpen(null)} onDone={onDone} />}
    </section>
  )
}
