import { useState } from 'react'
import { api, fmtDate, useApi } from './api'
import { useT } from './i18n'
import { ErrorNote, Loading } from './Widgets'

// ★★★★☆ display. `value` may be null (no reviews yet).
export function Stars({ value, count, onClick }) {
  const t = useT()
  if (value == null) return onClick ? null : <span className="fx-stars none">{t('No ratings yet')}</span>
  const full = Math.round(value)
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`fx-stars ${onClick ? 'link' : ''}`} onClick={onClick}
      title={t('{v} out of 5', { v: value })} aria-label={t('{v} out of 5', { v: value })}>
      <span aria-hidden="true">{'★'.repeat(full)}<i>{'★'.repeat(5 - full)}</i></span>
      <b>{value}</b>{count != null && <small>({count})</small>}
    </Tag>
  )
}

// Buyer rates the farmer after delivery.
export function ReviewModal({ order, onClose, onDone }) {
  const t = useT()
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const LABELS = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent']

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(`/api/orders/${order.id}/review`, { method: 'POST', body: { rating, comment } })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || rating
  return (
    <div className="fh-overlay" onClick={onClose}>
      <form className="fh-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{t('Rate {name}', { name: order.farmer_name })}</h3>
        <p className="fh-sub">{order.product_name} — {order.quantity} {t(order.unit || '')}</p>
        <div className="fx-star-pick" role="radiogroup" aria-label={t('Rating')} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n}`}
              className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}>★</button>
          ))}
          <span>{t(LABELS[shown])}</span>
        </div>
        <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={t('How was the quality, packing and delivery? (optional)')} aria-label={t('Comment')} />
        {error && <div className="fh-error">{error}</div>}
        <button className="fh-submit" disabled={busy}>{busy ? t('Saving…') : t('Submit review')}</button>
      </form>
    </div>
  )
}

// Everything buyers said about one farmer.
export function ReviewList({ farmerId, compact }) {
  const t = useT()
  const res = useApi(`/api/farmers/${farmerId}/reviews`)
  if (res.loading) return <Loading what="reviews" />
  if (res.error) return <ErrorNote error={res.error} onRetry={res.reload} />
  const d = res.data
  return (
    <div className="fx-reviews">
      <div className="fx-reviews-head">
        <div className="fx-reviews-score">
          <strong>{d.average ?? '—'}</strong>
          <Stars value={d.average} />
          <small>{t('{n} reviews', { n: d.count })}</small>
        </div>
        <div className="fx-reviews-bars">
          {[5, 4, 3, 2, 1].map((s) => (
            <div key={s}><span>{s}★</span><i><b style={{ width: d.count ? `${(d.stars[s] / d.count) * 100}%` : 0 }} /></i><small>{d.stars[s]}</small></div>
          ))}
        </div>
      </div>
      {d.reviews.length === 0 && <p className="fh-hint">{t('No reviews yet.')}</p>}
      <ul className="fx-review-list">
        {d.reviews.slice(0, compact ? 4 : 50).map((r) => (
          <li key={r.id}>
            <div><Stars value={r.rating} /> <small>{fmtDate(r.created_at)}</small></div>
            {r.comment && <p>“{r.comment}”</p>}
            <small>— {r.buyer_name}{r.buyer_business_type ? ` · ${t(r.buyer_business_type)}` : ''} · {r.product_name}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FarmerReviewsModal({ farmerId, name, onClose }) {
  const t = useT()
  return (
    <div className="fh-overlay" onClick={onClose}>
      <div className="fh-modal fx-reviews-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{t('Reviews for {name}', { name })}</h3>
        <ReviewList farmerId={farmerId} />
      </div>
    </div>
  )
}
