import { useState } from 'react'
import { api } from './api'
import { StateDistrictPicker } from './Combobox'
import { LANGS, useLang } from './i18n'
import { ReviewList } from './Reviews'
import { Notice, PageHeader } from './Widgets'

// Edit own contact details, location, PIN code and language.
export function ProfileCard({ user, onUserUpdate }) {
  const { t, setLang } = useLang()
  const [form, setForm] = useState({
    name: user.name || '', phone: user.phone || '', address: user.address || '',
    state: user.state || '', district: user.district || '', pincode: user.pincode || '',
    language: user.language || 'en',
  })
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg({ type: '', text: '' })
    try {
      const u = await api('/api/auth/me', { method: 'PATCH', body: form })
      onUserUpdate(u)
      setLang(u.language || 'en')
      setMsg({ type: 'ok', text: t('Profile saved.') })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="fh-card fx-kyb-form" onSubmit={submit}>
      <h3>{t('My details')}</h3>
      <label className="fx-field"><span>{user.role === 'farmer' ? t('Full name or farm name *') : t('Full name or business name *')}</span>
        <input value={form.name} onChange={set('name')} required maxLength={100} /></label>
      <div className="fh-row">
        <label className="fx-field"><span>{t('Phone')}</span><input value={form.phone} onChange={set('phone')} inputMode="tel" /></label>
        <label className="fx-field"><span>{t('PIN code')}</span><input value={form.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} /></label>
      </div>
      <StateDistrictPicker state={form.state} district={form.district} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
      <label className="fx-field"><span>{user.role === 'farmer' ? t('Farm address') : t('Delivery address')}</span>
        <input value={form.address} onChange={set('address')} /></label>
      <label className="fx-field"><span>{t('App language')}</span>
        <select value={form.language} onChange={set('language')}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
      {user.role === 'farmer' && <small className="fh-hint">{t('Changing your PIN code moves your pooled listings to the new village pool.')}</small>}
      <Notice msg={msg} />
      <button className="fh-submit" disabled={busy}>{busy ? t('Saving…') : t('Save profile')}</button>
    </form>
  )
}

// Farmer "My profile" tab: details on the left, what buyers say on the right.
export default function FarmerProfile({ user, onUserUpdate }) {
  const { t } = useLang()
  return (
    <div className="fx-page">
      <PageHeader kicker={t('MY PROFILE')} title={t('Your profile & reviews')}
        sub={t('Buyers see your name, district and rating. Good reviews bring repeat buyers.')} />
      <div className="fh-dash-grid fx-grid-wide">
        <ProfileCard user={user} onUserUpdate={onUserUpdate} />
        <section className="fh-card">
          <h3>{t('What buyers say')}</h3>
          <ReviewList farmerId={user.id} />
        </section>
      </div>
    </div>
  )
}
