import { useState } from 'react'
import { api, saveSession } from './api'
import { StateDistrictPicker } from './Combobox'
import { langForState, useLang } from './i18n'

const ROLE_INFO = {
  farmer: { icon: '🌱', title: 'Farmer account', sub: 'Sell produce, manage orders and track your earnings.' },
  buyer: { icon: '🛒', title: 'Buyer account', sub: 'Buy fresh produce directly and post what you need.' },
}

export default function AuthModal({ onClose, onAuth, initialMode = 'login', initialRole = 'buyer' }) {
  const { t, lang } = useLang()
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: initialRole, phone: '', state: '', district: '', pincode: '', address: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const info = ROLE_INFO[form.role]

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        // Default language: what the visitor picked, else the language of their state.
        const language = lang !== 'en' ? lang : langForState(form.state)
        await api('/api/auth/register', { method: 'POST', body: { ...form, language } })
      }
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password },
      })
      if (data.user.role !== form.role) {
        setError(data.user.role === 'farmer'
          ? t('This email is registered as a farmer. Choose "I\'m a Farmer" to continue.')
          : t('This email is registered as a buyer. Choose "I\'m a Buyer" to continue.'))
        return
      }
      saveSession({ token: data.access_token, user: data.user })
      onAuth(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fh-overlay" onClick={onClose}>
      <form className="fh-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="fh-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h3>{mode === 'login'
          ? (form.role === 'farmer' ? t('Login as farmer') : t('Login as buyer'))
          : (form.role === 'farmer' ? t('Create farmer account') : t('Create buyer account'))}</h3>
        <p className="fh-sub">{mode === 'login' ? t('You will land on your own dashboard after login.') : t(info.sub)}</p>

        <div className="fh-role" role="radiogroup" aria-label={t('Account type')}>
          {['farmer', 'buyer'].map((r) => (
            <button type="button" key={r} role="radio" aria-checked={form.role === r}
              className={form.role === r ? 'active' : ''}
              onClick={() => setForm((f) => ({ ...f, role: r }))}>
              {ROLE_INFO[r].icon} {r === 'farmer' ? t("I'm a Farmer") : t("I'm a Buyer")}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <input placeholder={form.role === 'farmer' ? t('Full name or farm name *') : t('Full name or business name *')}
            value={form.name} onChange={set('name')} required />
        )}
        <input type="email" placeholder={t('Email *')} value={form.email} onChange={set('email')} required />
        <input type="password" placeholder={t('Password (min 6) *')} value={form.password} onChange={set('password')} required minLength={6} />
        {mode === 'register' && (
          <>
            <input placeholder={t('Phone')} value={form.phone} onChange={set('phone')} />
            <StateDistrictPicker state={form.state} district={form.district}
              onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
            <div className="fh-row">
              <input placeholder={t('PIN code (e.g. 422202)')} value={form.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
              <input placeholder={form.role === 'farmer' ? t('Farm address') : t('Delivery address')} value={form.address} onChange={set('address')} />
            </div>
            <small className="fh-hint">{form.role === 'farmer'
              ? t('District shows you buyer demand nearby; PIN code lets you pool with village neighbours. The app opens in your state’s language.')
              : t('District shows you farmers nearby; PIN code is used for delivery. The app opens in your state’s language.')}</small>
          </>
        )}

        {error && <div className="fh-error">{error}</div>}
        <button className="fh-submit" disabled={busy}>
          {busy ? t('Please wait…') : mode === 'login' ? t('Login') : (form.role === 'farmer' ? t('Create farmer account') : t('Create buyer account'))}
        </button>
        <p className="fh-switch">
          {mode === 'login' ? t('New here?') : t('Already have an account?')}{' '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
            {mode === 'login' ? t('Create an account') : t('Login')}
          </button>
        </p>
      </form>
    </div>
  )
}
