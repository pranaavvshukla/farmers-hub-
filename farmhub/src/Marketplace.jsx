import { useMemo, useState } from 'react'
import { api, CATEGORIES, emojiFor, imgSrc, money, SEASON_LIST } from './api'
import EscrowPayModal from './Escrow'
import { useT } from './i18n'
import MandiCard from './MandiCard'
import { FarmerReviewsModal, Stars } from './Reviews'
import { QualityBadge, SeasonBadge } from './Widgets'

export function OrderModal({ product, user, onClose, onDone }) {
  const t = useT()
  const [qty, setQty] = useState(product.minimum_order)
  const [address, setAddress] = useState(user?.address || '')
  const [pincode, setPincode] = useState(user?.pincode || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const order = await api('/api/orders', {
        method: 'POST',
        body: { product_id: product.id, quantity: Number(qty), delivery_address: address, delivery_pincode: pincode },
      })
      setPlaced(order)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Step 2: pay into escrow right away (or later from "My orders").
  if (placed) return <EscrowPayModal orders={[placed]} title={t('Order placed ✅ — now pay into escrow')} onClose={onClose} onPaid={onDone} />

  return (
    <div className="fh-overlay" onClick={onClose}>
      <form className="fh-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{emojiFor(product.category)} {product.name} <QualityBadge grade={product.quality_grade} freshness={product.freshness_score} /></h3>
        <p className="fh-sub">
          {product.farmer_name} <Stars value={product.farmer_rating} count={product.farmer_reviews} /> · {money(product.price)}/{t(product.unit)} · {t('{q} {u} available', { q: product.quantity, u: t(product.unit) })} ·{' '}
          {t('min {q} {u}', { q: product.minimum_order, u: t(product.unit) })}
        </p>
        <MandiCard crop={product.name} district={product.district} state={product.state} price={product.price} unit={product.unit} audience="buyer" />
        <label htmlFor="order-qty">{t('Quantity ({u})', { u: t(product.unit) })}</label>
        <input id="order-qty" type="number" min={product.minimum_order} max={product.quantity} step="any"
          value={qty} onChange={(e) => setQty(e.target.value)} required />
        <div className="fh-row">
          <div>
            <label htmlFor="order-address">{t('Delivery address')}</label>
            <input id="order-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('Where should it be delivered?')} />
          </div>
          <div>
            <label htmlFor="order-pin">{t('Delivery PIN code')}</label>
            <input id="order-pin" value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="440012" />
          </div>
        </div>
        <div className="fh-total">{t('Total')}: <strong>{money((Number(qty) || 0) * product.price)}</strong></div>
        <p className="fx-escrow-hint">🔒 {t('You pay into escrow. The farmer gets 70% at pickup and 30% after you confirm delivery with your OTP.')}</p>
        {error && <div className="fh-error">{error}</div>}
        <button className="fh-submit" disabled={busy}>{busy ? t('Placing…') : t('Place order')}</button>
      </form>
    </div>
  )
}

// Buyer-only product grid with search, category, season and quality filters.
export default function Marketplace({ products, loading, error, currentSeason, onOrder, onRetry }) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [season, setSeason] = useState('')
  const [gradeA, setGradeA] = useState(false)
  const [reviewsOf, setReviewsOf] = useState(null)

  const shown = useMemo(
    () => products.filter((p) =>
      (!category || p.category === category) &&
      (!season || p.season === season) &&
      (!gradeA || p.quality_grade === 'Grade A') &&
      (!search || `${p.name} ${p.district || ''} ${p.state || ''} ${p.farmer_name || ''}`
        .toLowerCase().includes(search.toLowerCase()))
    ),
    [products, search, category, season, gradeA]
  )

  return (
    <section className="fx-market" id="marketplace">
      <div className="fh-filters fx-filters">
        <input aria-label={t('Search produce')} placeholder={t('Search produce, district, farmer…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('Category')} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('All categories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
        <select aria-label={t('Season')} value={season} onChange={(e) => setSeason(e.target.value)}>
          <option value="">{t('All seasons')}</option>
          {SEASON_LIST.map((s) => <option key={s} value={s}>{t(s)}{s === currentSeason ? ` (${t('now')})` : ''}</option>)}
        </select>
        {currentSeason && (
          <button className={`fx-chip-btn ${season === currentSeason ? 'active' : ''}`}
            onClick={() => setSeason(season === currentSeason ? '' : currentSeason)}>
            🌦️ {t('In season now')}
          </button>
        )}
        <button className={`fx-chip-btn ${gradeA ? 'active' : ''}`} onClick={() => setGradeA(!gradeA)}>★ {t('Grade A only')}</button>
      </div>

      {loading && <p className="fh-note">{t('Loading produce…')}</p>}
      {error && <div className="fh-note fh-error">{error} <button onClick={onRetry}>{t('Retry')}</button></div>}
      {!loading && !error && shown.length === 0 && (
        <p className="fh-note">{t('No produce matches these filters.')}</p>
      )}

      <div className="product-grid">
        {shown.map((p) => (
          <article className="product-card" key={p.id}>
            <div className="product-image">
              {p.image_url ? <img src={imgSrc(p.image_url)} alt={p.name} className="fh-prod-img" /> : emojiFor(p.category)}
              {p.quality_grade && <span className="fx-card-grade"><QualityBadge grade={p.quality_grade} freshness={p.freshness_score} /></span>}
            </div>
            <div className="product-info">
              <div className="fx-card-title"><h3>{p.name}</h3><SeasonBadge season={p.season} /></div>
              <p>{p.farmer_name} · {p.district || p.state || 'India'}{p.pool_id ? ` · 🤝 ${t('Village pool')}` : ''}</p>
              <Stars value={p.farmer_rating} count={p.farmer_reviews} onClick={() => setReviewsOf({ id: p.farmer_id, name: p.farmer_name })} />
              <div className="product-bottom">
                <div>
                  <strong>{money(p.price)}</strong>
                  <span>/ {t(p.unit)}</span>
                  <small>{t('{q} {u} available', { q: p.quantity, u: t(p.unit) })}</small>
                </div>
                <button disabled={p.quantity <= 0} onClick={() => onOrder(p)}>
                  {p.quantity <= 0 ? t('Sold out') : `${t('Order')} →`}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {reviewsOf && <FarmerReviewsModal farmerId={reviewsOf.id} name={reviewsOf.name} onClose={() => setReviewsOf(null)} />}
    </section>
  )
}
