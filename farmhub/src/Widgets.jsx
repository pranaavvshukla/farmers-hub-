// Small building blocks shared by the farmer and buyer screens.
import { money } from './api'
import { useT } from './i18n'

export function PageHeader({ kicker, title, sub, action }) {
  return (
    <div className="fx-page-head">
      <div>
        {kicker && <span className="section-kicker">{kicker}</span>}
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ icon, label, value, tone, onClick, hint }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`fh-stat ${tone || ''} ${onClick ? 'fx-clickable' : ''}`} onClick={onClick}>
      <span className="fh-stat-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
        {hint && <small className="fx-stat-hint">{hint}</small>}
      </div>
    </Tag>
  )
}

const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', picked_up: 'In transit', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' }

export function StatusPill({ status }) {
  const t = useT()
  return <span className={`fh-status ${status}`}>{t(STATUS_LABEL[status] || status)}</span>
}

export function SeasonBadge({ season }) {
  const t = useT()
  if (!season) return null
  const slug = season.toLowerCase().replace(/\s+/g, '-')
  return <span className={`fx-season fx-season-${slug}`}>{t(season)}</span>
}

export function QualityBadge({ grade, freshness }) {
  const t = useT()
  if (!grade) return null
  const a = grade === 'Grade A'
  return (
    <span className={`fx-quality ${a ? 'a' : 'b'}`} title={t('Automatic photo check: colour, sharpness and dark spots')}>
      {a ? '★' : '☆'} {t(grade)}{freshness ? ` · ${freshness}% ${t('fresh')}` : ''}
    </span>
  )
}

// Shown to farmers next to a buyer: verified business, or flagged as a possible middleman.
export function BuyerTrust({ order }) {
  const t = useT()
  if (order.buyer_flagged) {
    return <span className="fx-flag-badge" title={order.buyer_flag_reason}>⚠ {t('Possible middleman')}</span>
  }
  if (order.buyer_kyb_verified) {
    return <span className="fx-kyb-badge" title={order.buyer_business_type}>✔ {t('Verified')} {order.buyer_business_type ? `· ${t(order.buyer_business_type)}` : ''}</span>
  }
  return <span className="fx-unverified">{t('Not verified')}</span>
}

const ESCROW_STEPS = [
  ['LOCKED_100', 'Paid into escrow', '100% locked'],
  ['RELEASED_70', 'Picked up', '70% to farmer'],
  ['SETTLED_100', 'Delivered', '100% settled'],
]
const ESCROW_RANK = { UNPAID: 0, LOCKED_100: 1, RELEASED_70: 2, SETTLED_100: 3 }

// Milestone escrow timeline used on both farmer and buyer order cards.
export function EscrowTimeline({ order }) {
  const t = useT()
  const s = order.escrow_status
  if (s === 'OFFLINE') return <div className="fx-escrow-note">💵 {t('Paid outside FarmHub (cash / direct UPI)')}</div>
  if (s === 'REFUNDED') return <div className="fx-escrow-note refunded">↩ {t('Escrow refunded to the buyer')}</div>
  if (order.status === 'rejected' || order.status === 'cancelled') return null
  const rank = ESCROW_RANK[s] ?? 0
  return (
    <div className="fx-escrow" aria-label={t('Escrow status')}>
      <span className={`fx-escrow-shield ${rank ? 'on' : ''}`} aria-hidden="true">🔒</span>
      <ol>
        {ESCROW_STEPS.map(([key, label, sub], i) => (
          <li key={key} className={rank > i ? 'done' : rank === i ? 'next' : ''}>
            <i aria-hidden="true">{rank > i ? '✓' : i + 1}</i>
            <span>{t(label)}<small>{t(sub)}</small></span>
          </li>
        ))}
      </ol>
      {rank === 0 && <span className="fx-escrow-wait">{t('Awaiting buyer payment')}</span>}
      {order.released_amount > 0 && rank < 3 && <span className="fx-escrow-wait good">{money(order.released_amount)} {t('released')}</span>}
    </div>
  )
}

export function Notice({ msg }) {
  if (!msg?.text) return null
  return <div className={`fh-note ${msg.type === 'error' ? 'fh-error' : 'fh-ok'}`} role="status">{msg.text}</div>
}

export function Loading({ what = 'data' }) {
  const t = useT()
  return <p className="fh-hint fx-loading">{t('Loading {what}…', { what: t(what) })}</p>
}

export function ErrorNote({ error, onRetry }) {
  const t = useT()
  if (!error) return null
  return (
    <div className="fh-note fh-error">
      {error} {onRetry && <button onClick={onRetry}>{t('Retry')}</button>}
    </div>
  )
}

// Order card used on both dashboards. `actions` renders the buttons on the right.
export function OrderRow({ order, isFarmer, actions, extra }) {
  const t = useT()
  return (
    <div className="fh-item fx-order">
      <div className="fx-order-top">
        <div className="fh-item-main">
          <strong>
            {order.product_name} — {order.quantity} {order.unit}
            {order.pool_ref && <span className="fx-pool-tag">🤝 {t('Village pool')}</span>}
          </strong>
          <small>
            {isFarmer ? `${t('Buyer')}: ${order.buyer_name}` : `${t('Farmer')}: ${order.farmer_name}`} · {money(order.total_price)}
            {order.delivery_address ? ` · ${order.delivery_address}` : ''}
          </small>
          {isFarmer && <div className="fx-order-badges"><BuyerTrust order={order} /></div>}
        </div>
        <SeasonBadge season={order.season} />
        <StatusPill status={order.status} />
        {actions && <div className="fh-actions">{actions}</div>}
      </div>
      <EscrowTimeline order={order} />
      {extra}
    </div>
  )
}

export function StatusFilter({ value, onChange, counts }) {
  const t = useT()
  const opts = ['all', 'pending', 'accepted', 'picked_up', 'completed', 'rejected', 'cancelled']
  return (
    <div className="fx-chips" role="group" aria-label={t('Filter by status')}>
      {opts.map((o) => (
        <button key={o} className={value === o ? 'active' : ''} onClick={() => onChange(o)}>
          {o === 'all' ? t('All') : t(STATUS_LABEL[o])} {counts && <span>{counts[o] ?? 0}</span>}
        </button>
      ))}
    </div>
  )
}
