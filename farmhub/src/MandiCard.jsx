import { useEffect, useState } from 'react'
import { api, money } from './api'
import { useT } from './i18n'

// "Live Mandi & MSP Benchmark": district APMC modal price + Govt MSP next to the
// farmer's own price, so nobody can talk them into selling far below the market.
export default function MandiCard({ crop, district, state, price, unit = 'kg', audience = 'farmer' }) {
  const t = useT()
  const [res, setRes] = useState({ data: null, loading: false, key: '' })
  const key = [crop, district, state, price, unit].join('|')

  useEffect(() => {
    if (!crop || crop.trim().length < 3) return
    let alive = true
    const timer = setTimeout(() => {
      setRes((r) => ({ ...r, loading: true }))
      const q = new URLSearchParams({ crop, unit })
      if (district) q.set('district', district)
      if (state) q.set('state', state)
      if (price) q.set('price', price)
      api(`/api/mandi-price?${q}`)
        .then((data) => alive && setRes({ data: data || null, loading: false, key }))
        .catch(() => alive && setRes({ data: null, loading: false, key }))
    }, 450)
    return () => { alive = false; clearTimeout(timer) }
  }, [crop, district, state, price, unit, key])

  if (!crop || crop.trim().length < 3) return null
  const b = res.data
  if (!b) {
    return res.loading ? <div className="fx-mandi muted">{t('Checking mandi rates…')}</div>
      : res.key ? <div className="fx-mandi muted">📊 {t('No mandi benchmark for this crop yet.')}</div> : null
  }
  const c = b.comparison
  const tone = c ? c.verdict : 'info'
  const perUnit = c ? c.mandi_per_unit : b.modal_per_quintal / 100
  const unitLabel = c ? unit : 'kg'

  return (
    <div className={`fx-mandi ${tone}`} aria-live="polite">
      <div className="fx-mandi-head">
        <strong>📊 {t('Live Mandi & MSP Benchmark')}</strong>
        <span className={`fx-mandi-src ${b.source}`}>{b.source === 'live' ? t('Live · AGMARKNET') : t('Cached rates · {date}', { date: b.as_of })}</span>
      </div>
      <div className="fx-mandi-grid">
        <div><small>{t('Mandi modal price')}</small><b>{money(perUnit)}/{unitLabel}</b><span>{b.market}</span></div>
        <div><small>{t('Govt MSP')}</small><b>{c?.msp_per_unit ? `${money(c.msp_per_unit)}/${unitLabel}` : b.msp_per_quintal ? `${money(b.msp_per_quintal)}/quintal` : '—'}</b><span>{b.msp_per_quintal ? t(b.msp_note) : t('No MSP for this crop')}</span></div>
        {c && (
          <div><small>{audience === 'farmer' ? t('Your price') : t("Farmer's price")}</small><b>{money(price)}/{unit}</b>
            <span className="fx-mandi-diff">{c.diff_percent > 0 ? '+' : ''}{c.diff_percent}% {t('vs mandi')}</span></div>
        )}
      </div>
      {c && audience === 'farmer' && (
        <p className="fx-mandi-verdict">
          {c.verdict === 'good' && `✅ ${t('Good price — at or above the local mandi rate.')}`}
          {c.verdict === 'fair' && `👍 ${t('Fair — slightly below the mandi rate.')}`}
          {c.verdict === 'low' && (c.below_msp
            ? `⚠️ ${t('Below the government MSP. You can get more — do not undersell.')}`
            : `⚠️ ${t('More than 15% below the mandi rate. A middleman could be undercutting you.')}`)}
        </p>
      )}
      {c && audience === 'buyer' && (
        <p className="fx-mandi-verdict">{c.diff_percent <= 0 ? `✅ ${t('At or below the mandi rate — straight from the farm.')}` : `ℹ️ ${t('Above mandi rate: you pay for direct, graded, fresh produce.')}`}</p>
      )}
    </div>
  )
}
