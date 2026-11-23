import { useState } from 'react'
import { api, fmtDate, useApi } from './api'
import { useT } from './i18n'
import { ProfileCard } from './Profile'
import { Notice, PageHeader } from './Widgets'

const NEEDS_GST = ['Food Processor', 'Hotel/HoReCa', 'Retail Chain']

// Know-Your-Business: GSTIN (official checksum) + FSSAI + business type. Commission
// agents and traders are refused, so farmers know they sell to the real end buyer.
export default function BuyerProfile({ user, onUserUpdate }) {
  const t = useT()
  const opts = useApi('/api/kyb/options')
  const [form, setForm] = useState({
    business_type: user.business_type || 'Hotel/HoReCa',
    gstin: user.gstin || '',
    fssai_no: user.fssai_no || '',
    pincode: user.pincode || '',
  })
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const needsGst = NEEDS_GST.includes(form.business_type)
  const types = [...(opts.data?.business_types || NEEDS_GST.concat(['RWA Group', 'Individual'])), ...(opts.data?.blocked_types || [])]

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg({ type: '', text: '' })
    try {
      const u = await api('/api/buyer/verify-kyb', { method: 'POST', body: form })
      onUserUpdate(u)
      setMsg({ type: 'ok', text: t('Business verified! Farmers will see a verified badge on your orders.') })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
      api('/api/auth/me').then(onUserUpdate).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fx-page">
      <PageHeader kicker={t('BUSINESS PROFILE')} title={t('Verify your business')}
        sub={t('Farmers trust verified buyers. FarmHub checks your GSTIN and FSSAI numbers and keeps commission agents out.')} />

      <div className="fx-kyb-status-row">
        {user.kyb_verified ? (
          <div className="fx-kyb-card ok">
            <span aria-hidden="true">✔</span>
            <div>
              <strong>{t('Verified business')}</strong>
              <small>{t(user.business_type || '')}{user.gstin_masked ? ` · GSTIN ${user.gstin_masked}` : ''}{user.kyb_verified_at ? ` · ${fmtDate(user.kyb_verified_at)}` : ''}</small>
            </div>
          </div>
        ) : (
          <div className="fx-kyb-card pending">
            <span aria-hidden="true">🛡️</span>
            <div><strong>{t('Not verified yet')}</strong><small>{t('Verified buyers get priority from farmers and can order from village pools with confidence.')}</small></div>
          </div>
        )}
        {user.flagged_middleman && (
          <div className="fx-kyb-card flag">
            <span aria-hidden="true">⚠</span>
            <div><strong>{t('Account under review')}</strong><small>{user.flag_reason}</small></div>
          </div>
        )}
      </div>

      <div className="fh-dash-grid fx-grid-wide">
        <form className="fh-card fx-kyb-form" onSubmit={submit}>
          <h3>{t('Business details')}</h3>
          <label className="fx-field"><span>{t('Business type')}</span>
            <select value={form.business_type} onChange={set('business_type')}>
              {types.map((ty) => <option key={ty} value={ty}>{t(ty)}</option>)}
            </select>
          </label>
          <label className="fx-field"><span>GSTIN {needsGst ? '*' : `(${t('optional')})`}</span>
            <input value={form.gstin} onChange={set('gstin')} placeholder="27ABCDE1234F1Z5" maxLength={15}
              style={{ textTransform: 'uppercase' }} required={needsGst} />
          </label>
          <label className="fx-field"><span>{t('FSSAI licence number')} {needsGst ? '*' : `(${t('optional')})`}</span>
            <input value={form.fssai_no} onChange={set('fssai_no')} placeholder="11521998000123" inputMode="numeric" maxLength={14} required={needsGst} />
          </label>
          <label className="fx-field"><span>{t('Business PIN code')} *</span>
            <input value={form.pincode} onChange={set('pincode')} placeholder="440012" inputMode="numeric" maxLength={6} required />
          </label>
          <Notice msg={msg} />
          <button className="fh-submit" disabled={busy}>{busy ? t('Checking…') : t('Verify business')}</button>
        </form>

        <section className="fh-card fx-kyb-how">
          <h3>{t('How verification works')}</h3>
          <ol>
            <li><b>{t('GSTIN checksum')}</b> {t('— the 15th character of every real GSTIN is a check digit. We recompute it, so typos and fake numbers fail instantly.')}</li>
            <li><b>{t('State match')}</b> {t('— the first two digits are the GST state code and must match your state.')}</li>
            <li><b>{t('FSSAI')}</b> {t('— food businesses need a 14-digit FSSAI licence.')}</li>
            <li><b>{t('No middlemen')}</b> {t('— commission agents and traders are refused.')}</li>
            <li><b>{t('Behaviour check')}</b> {t('— buying more than 4 unrelated crops, or shipping to more than 3 PIN codes in a week, flags the account for review.')}</li>
          </ol>
          <small className="fh-hint">{t('All checks run on FarmHub’s own server: no paid KYC service is needed.')}</small>
        </section>
      </div>
      <div className="fh-dash-grid fx-grid-wide">
        <ProfileCard user={user} onUserUpdate={onUserUpdate} />
      </div>
    </div>
  )
}
