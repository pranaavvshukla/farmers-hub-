import { useState } from 'react'
import { api, money } from './api'
import { useT } from './i18n'

const FIELDS = [
  ['transport_cost', 'Transport / freight', 'transport'],
  ['packaging_cost', 'Packaging (crates, bags)', 'packaging'],
  ['labour_cost', 'Loading & labour', 'labour'],
  ['other_cost', 'Other (mandi fee, cold storage…)', 'other'],
]

// Farmer enters the selling costs of a sale. mode "complete" also marks the order
// delivered (with the buyer's OTP when the order is paid through escrow);
// mode "edit" updates costs of an already completed sale.
export default function SaleCostsModal({ order, feePct = 0, mode = 'complete', onClose, onDone }) {
  const t = useT()
  const d = order.deductions || {}
  const escrow = ['LOCKED_100', 'RELEASED_70'].includes(order.escrow_status)
  const [form, setForm] = useState(() => {
    const init = {}
    for (const [key, , short] of FIELDS) init[key] = mode === 'edit' && d[short] ? String(d[short]) : ''
    init.unit_cost = order.unit_cost != null ? String(order.unit_cost) : ''
    return init
  })
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fee = mode === 'edit' ? d.platform_fee || 0 : Math.round(order.total_price * feePct) / 100
  const costs = FIELDS.reduce((s, [key]) => s + (Number(form[key]) || 0), 0)
  const net = order.total_price - fee - costs
  const production = (Number(form.unit_cost) || 0) * order.quantity

  async function submit(e) {
    e.preventDefault()
    setError('')
    const body = {}
    for (const key of [...FIELDS.map((f) => f[0]), 'unit_cost']) {
      if (form[key] !== '') body[key] = Number(form[key])
      else if (mode === 'edit') body[key] = null
    }
    if (net < 0) return setError(t('Costs are more than the sale amount. Check the numbers.'))
    setBusy(true)
    try {
      if (mode === 'complete') {
        await api(`/api/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'completed', otp, ...body } })
      } else {
        await api(`/api/orders/${order.id}/costs`, { method: 'PATCH', body })
      }
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fh-overlay" onClick={onClose}>
      <form className="fh-modal fx-costs" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{mode === 'complete' ? (escrow ? t('Confirm delivery') : t('Complete sale')) : t('Edit sale costs')}</h3>
        <p className="fh-sub">
          {order.product_name} — {order.quantity} {order.unit} → {order.buyer_name}.{' '}
          {t('Enter what you spent to deliver this sale. Leave blank if nothing.')}
        </p>

        {mode === 'complete' && escrow && (
          <label className="fx-field fx-otp-field">
            <span>🔐 {t('Delivery OTP from the buyer')} <small>{t('The buyer sees this 4-digit code in their app. It releases the remaining payment.')}</small></span>
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric"
              placeholder="• • • •" required autoFocus aria-label={t('Delivery OTP')} />
          </label>
        )}

        {FIELDS.map(([key, label]) => (
          <label key={key} className="fx-field">
            <span>{t(label)}</span>
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="₹ 0"
              value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </label>
        ))}
        <label className="fx-field">
          <span>{t('Production cost per {unit}', { unit: t(order.unit || 'unit') })} <small>{t('(seeds, fertiliser, farm labour)')}</small></span>
          <input type="number" min="0" step="any" inputMode="decimal" placeholder={t('₹ per unit')}
            value={form.unit_cost} onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))} />
        </label>

        <dl className="fx-breakdown">
          <div><dt>{t('Sale amount')}</dt><dd>{money(order.total_price)}</dd></div>
          <div><dt>{t('Platform fee')}{mode === 'complete' ? ` (${feePct}%)` : ''}</dt><dd>− {money(fee)}</dd></div>
          <div><dt>{t('Your selling costs')}</dt><dd>− {money(costs)}</dd></div>
          <div className="fx-breakdown-total"><dt>{t('Reaches your bank')}</dt><dd>{money(net)}</dd></div>
          {mode === 'complete' && order.released_amount > 0 && (
            <div className="fx-breakdown-sub"><dt>{t('Already released at pickup (70%)')}</dt><dd>{money(order.released_amount)}</dd></div>
          )}
          {mode === 'complete' && order.released_amount > 0 && (
            <div className="fx-breakdown-sub"><dt>{t('Released now on delivery')}</dt><dd>{money(order.total_price - fee - order.released_amount)}</dd></div>
          )}
          <div className="fx-breakdown-sub"><dt>{t('Gross profit (sale − production cost)')}</dt><dd>{money(order.total_price - production)}</dd></div>
        </dl>

        {error && <div className="fh-error">{error}</div>}
        <button className="fh-submit" disabled={busy}>
          {busy ? t('Saving…') : mode === 'complete' ? (escrow ? t('Confirm delivery & release payment') : t('Mark completed')) : t('Save costs')}
        </button>
      </form>
    </div>
  )
}
