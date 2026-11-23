import { useState } from 'react'
import { api, money, useApi } from './api'
import { useT } from './i18n'

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js'

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = CHECKOUT_JS
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

// Buyer pays into FarmHub escrow: 100% locked, 70% to the farmer at pickup, 30% when the
// buyer shares the delivery OTP. With Razorpay test keys in backend/.env the real Razorpay
// checkout opens (test mode); otherwise a simulated UPI payment is used.
export default function EscrowPayModal({ orders, onClose, onPaid, title }) {
  const t = useT()
  const cfg = useApi('/api/payments/config')
  const total = orders.reduce((s, o) => s + o.total_price, 0)
  const ids = orders.map((o) => o.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const gateway = cfg.data?.provider === 'razorpay'

  const finish = (res) => { setDone(res); onPaid?.(res) }

  async function payDemo() {
    setBusy(true)
    setError('')
    try {
      finish(await api('/api/orders/pay', { method: 'POST', body: { order_ids: ids } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function payRazorpay() {
    setBusy(true)
    setError('')
    try {
      if (!(await loadRazorpay())) throw new Error(t('Could not load Razorpay checkout. Check your internet connection.'))
      const o = await api('/api/payments/razorpay/order', { method: 'POST', body: { order_ids: ids } })
      const rzp = new window.Razorpay({
        key: o.key_id,
        amount: o.amount,
        currency: o.currency,
        name: 'FarmHub',
        description: t('Escrow payment · {n} order(s)', { n: ids.length }),
        order_id: o.razorpay_order_id,
        prefill: { name: o.buyer.name, email: o.buyer.email, contact: o.buyer.contact },
        notes: { farmhub_orders: ids.join(',') },
        theme: { color: '#17301f' },
        // UPI first, QR code shown first inside it; cards / netbanking stay below.
        config: {
          display: {
            blocks: {
              upi: { name: t('Pay by UPI · Scan QR'), instruments: [{ method: 'upi', flows: ['qr', 'intent', 'collect'] }] },
            },
            sequence: ['block.upi'],
            preferences: { show_default_blocks: true },
          },
        },
        handler: async (resp) => {
          try {
            finish(await api('/api/payments/razorpay/verify', { method: 'POST', body: { order_ids: ids, ...resp } }))
          } catch (err) {
            setError(err.message)
          } finally {
            setBusy(false)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', (e) => { setError(e?.error?.description || t('Payment failed. Please try again.')); setBusy(false) })
      rzp.open()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fh-overlay" onClick={onClose}>
      <div className="fh-modal fx-pay" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Pay into escrow')}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        {done ? (
          <>
            <div className="fx-pay-ok" aria-hidden="true">🔒</div>
            <h3>{t('Payment locked in escrow')}</h3>
            <p className="fh-sub">{gateway ? t('Razorpay payment ID') : t('UPI reference')}: <b>{done.upi_ref}</b></p>
            <div className="fx-otp-box">
              <small>{t('Your delivery OTP')}</small>
              <strong>{done.orders[0]?.delivery_otp}</strong>
              <span>{t('Share this code with the farmer only when the goods reach you. It releases the last 30%.')}</span>
            </div>
            <button type="button" className="fh-submit" onClick={onClose}>{t('Done')}</button>
          </>
        ) : (
          <>
            <h3>{title || t('Pay into escrow')}</h3>
            <p className="fh-sub">{orders.length > 1 ? t('{n} orders from village farmers', { n: orders.length }) : `${orders[0].product_name} — ${orders[0].quantity} ${orders[0].unit || ''}`}</p>
            <div className="fx-pay-amount">{money(total)}</div>
            <ol className="fx-pay-steps">
              <li><b>100%</b> {t('locked safely — the farmer cannot take it yet')}</li>
              <li><b>70%</b> {t('released to the farmer when the goods are picked up')}</li>
              <li><b>30%</b> {t('released when you give the delivery OTP on arrival')}</li>
            </ol>
            {gateway ? (
              <div className="fx-upi rzp">
                <span className="fx-rzp-logo">Razorpay</span>
                <div>
                  <strong>{cfg.data.test_mode ? t('Razorpay · Test mode') : 'Razorpay'}</strong>
                  <small>{cfg.data.test_mode
                    ? t('UPI, cards, netbanking. Test mode: no real money — use the test options shown in the checkout (e.g. UPI ID success@razorpay).')
                    : t('UPI, cards and netbanking via Razorpay.')}</small>
                </div>
              </div>
            ) : (
              <div className="fx-upi">
                <span className="fx-upi-logo">UPI</span>
                <div><strong>{t('Demo payment')}</strong><small>{t('Simulated UPI for the prototype — no real money moves.')}</small></div>
              </div>
            )}
            {error && <div className="fh-error">{error}</div>}
            <button type="button" className="fh-submit" disabled={busy || cfg.loading} onClick={gateway ? payRazorpay : payDemo}>
              {busy ? t('Processing…') : gateway ? t('Pay {amount} with Razorpay', { amount: money(total) }) : t('Pay {amount} into escrow', { amount: money(total) })}
            </button>
            <button type="button" className="fh-link fx-pay-later" onClick={onClose}>{t('Pay later from My orders')}</button>
          </>
        )}
      </div>
    </div>
  )
}
