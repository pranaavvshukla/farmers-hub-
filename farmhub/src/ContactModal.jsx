import { money, timeLeft } from './api'
import { useT } from './i18n'

// Shows a buyer's requirement + contact details (only returned by the API to logged-in farmers).
export default function ContactModal({ req, onClose }) {
  const t = useT()
  const unit = t(req.unit)
  const price =
    req.min_price != null && req.max_price != null
      ? `${money(req.min_price)} – ${money(req.max_price)} / ${unit}`
      : req.max_price != null
        ? t('Up to {price} / {unit}', { price: money(req.max_price), unit })
        : t('Open to offers')

  return (
    <div className="fh-overlay" onClick={onClose}>
      <div className="fh-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{req.product_name}</h3>
        <p className="fh-sub">
          {t('{q} {u} required', { q: req.quantity, u: unit })} · {price} · {timeLeft(req.expires_at, t)}
        </p>
        {req.description && <p className="fh-sub">“{req.description}”</p>}
        <div className="fh-contact">
          <strong>{req.buyer_name}</strong>
          <span>📍 {req.location || req.district || '—'}</span>
          {req.buyer_phone ? (
            <a href={`tel:${req.buyer_phone}`} className="fh-submit fh-call">📞 {t('Call')} {req.buyer_phone}</a>
          ) : (
            <span className="fh-hint">{t('Contact details are visible to logged-in farmers only.')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
