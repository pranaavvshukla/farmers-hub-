import { useCallback, useMemo, useState } from 'react'
import {
  api, CATEGORIES, emojiFor, guessSeason, imgSrc, money, SEASON_HINT, SEASON_LIST,
  timeLeft, UNITS, uploadImage, useApi, useHashTab,
} from './api'
import ContactModal from './ContactModal'
import Finance from './Finance'
import { useT } from './i18n'
import MandiCard from './MandiCard'
import FarmerProfile from './Profile'
import QualityReport from './QualityReport'
import RegionalMap from './RegionalMap'
import { Stars } from './Reviews'
import SaleCostsModal from './SaleCostsModal'
import SeasonalCrops from './SeasonalCrops'
import Shell from './Shell'
import VoiceFill from './VoiceFill'
import { ErrorNote, Loading, Notice, OrderRow, PageHeader, QualityBadge, SeasonBadge, Stat, StatusFilter } from './Widgets'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'produce', label: 'My produce', icon: '🧺' },
  { id: 'orders', label: 'Orders', icon: '📦' },
  { id: 'demand', label: 'Buyer demand', icon: '📢' },
  { id: 'seasonal', label: 'Seasonal crops', icon: '🌦️' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'profile', label: 'My profile', icon: '👤' },
]
const TAB_IDS = TABS.map((t) => t.id)

export default function FarmerApp({ user, onLogout, onUserUpdate, onLanguage }) {
  const [tab, go] = useHashTab(TAB_IDS, 'overview')
  const [rk, setRk] = useState(0)
  const refresh = useCallback(() => setRk((k) => k + 1), [])
  const stats = useApi('/api/stats', rk)
  const [contact, setContact] = useState(null)
  const [costs, setCosts] = useState(null) // { order, mode }

  const shared = { user, rk, refresh, go, onUserUpdate, onContact: setContact, onCosts: (order, mode) => setCosts({ order, mode }) }

  return (
    <Shell user={user} tabs={TABS} active={tab} onTab={go} onLogout={onLogout} onLanguage={onLanguage}>
      {tab === 'overview' && <Overview {...shared} stats={stats} />}
      {tab === 'produce' && <Produce {...shared} />}
      {tab === 'orders' && <Orders {...shared} />}
      {tab === 'demand' && <Demand {...shared} />}
      {tab === 'seasonal' && <SeasonalCrops role="farmer" user={user} rk={rk} onContact={setContact} />}
      {tab === 'finance' && <Finance role="farmer" rk={rk} refresh={refresh} />}
      {tab === 'profile' && <FarmerProfile user={user} onUserUpdate={onUserUpdate} />}

      {contact && <ContactModal req={contact} onClose={() => setContact(null)} />}
      {costs && (
        <SaleCostsModal order={costs.order} mode={costs.mode} feePct={stats.data?.platform_fee_percent ?? 0}
          onClose={() => setCosts(null)} onDone={() => { setCosts(null); refresh() }} />
      )}
    </Shell>
  )
}

function useOrderActions(refresh) {
  const [msg, setMsg] = useState({ type: '', text: '' })
  const setStatus = async (id, status) => {
    setMsg({ type: '', text: '' })
    try {
      // The server's message explains escrow releases ("70% released…").
      const res = await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status }, full: true })
      setMsg({ type: 'ok', text: res.message })
      refresh()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }
  return { msg, setStatus }
}

function OrderActions({ order, setStatus, onCosts }) {
  const t = useT()
  const esc = order.escrow_status
  if (order.status === 'pending') {
    return (
      <>
        <button onClick={() => setStatus(order.id, 'accepted')}>{t('Accept')}</button>
        <button className="danger" onClick={() => setStatus(order.id, 'rejected')}>{t('Reject')}</button>
      </>
    )
  }
  if (order.status === 'accepted') {
    return (
      <>
        {esc === 'LOCKED_100'
          ? <button className="fx-primary" onClick={() => setStatus(order.id, 'picked_up')}>🚚 {t('Mark picked up')} <small>{t('(get 70%)')}</small></button>
          : <button onClick={() => onCosts(order, 'complete')} title={t('Buyer paid you outside FarmHub')}>{t('Complete (paid outside)')}</button>}
        <button className="danger" onClick={() => setStatus(order.id, 'rejected')}>{t('Reject')}</button>
      </>
    )
  }
  if (order.status === 'picked_up') {
    return <button className="fx-primary" onClick={() => onCosts(order, 'complete')}>✅ {t('Delivered — enter OTP')}</button>
  }
  if (order.status === 'completed') {
    return <button onClick={() => onCosts(order, 'edit')} title={t('Edit selling costs')}>{money(order.net_payout)} {t('to bank')} ✎</button>
  }
  return null
}

// ---------------------------------------------------------------- Overview

function Overview({ user, rk, refresh, go, onContact, onCosts, stats }) {
  const t = useT()
  const orders = useApi('/api/orders', rk)
  const demand = useApi(`/api/requirements${user.district ? `?district=${encodeURIComponent(user.district)}` : ''}`, rk)
  const { msg, setStatus } = useOrderActions(refresh)
  const s = stats.data
  const todo = (orders.data || []).filter((o) => ['pending', 'accepted', 'picked_up'].includes(o.status)).slice(0, 5)

  return (
    <div className="fx-page">
      <PageHeader
        kicker={t('FARMER DASHBOARD')}
        title={t('Namaste, {name} 👋', { name: user.name })}
        sub={s ? t('It is {season} season ({hint}).', { season: t(s.current_season), hint: t(SEASON_HINT[s.current_season]) }) : t('Your farm at a glance.')}
        action={s && (
          <button className="fx-rating-card" onClick={() => go('profile')}>
            <small>{t('Your buyer rating')}</small>
            <Stars value={s.rating} count={s.review_count} />
          </button>
        )}
      />
      <ErrorNote error={stats.error} onRetry={stats.reload} />
      {s ? (
        <div className="fh-stats">
          <Stat icon="🏦" label={t('Received in bank')} value={money(s.net_received)} tone="good" hint={t('After all deductions')} onClick={() => go('finance')} />
          <Stat icon="🔒" label={t('Held in escrow')} value={money(s.escrow_held)} hint={t('Buyer has paid · released on pickup and delivery')} onClick={() => go('orders')} />
          <Stat icon="⏳" label={t('Payout on the way')} value={money(s.pipeline_value)} hint={t('Pending, accepted and in-transit orders')} onClick={() => go('orders')} />
          <Stat icon="📢" label={t('Buyer demand nearby')} value={s.nearby_requirements} tone="accent" onClick={() => go('demand')} />
        </div>
      ) : <Loading what="stats" />}

      <div className="fx-quick">
        <button className="fx-quick-card fx-quick-main" onClick={() => go('finance')}>
          <span aria-hidden="true">💰</span>
          <strong>{t('Financial dashboard →')}</strong>
          <small>{t('Crops sold most, every deduction, money in bank, gross profit by month, quarter and year')}</small>
        </button>
        <button className="fx-quick-card" onClick={() => go('produce')}>
          <span aria-hidden="true">🎙️</span>
          <strong>{t('List produce by voice')}</strong>
          <small>{s ? t('{a} of {b} listings active · {p} in village pools', { a: s.active_listings, b: s.total_products, p: s.pooled_listings }) : t('Add price, stock and photo')}</small>
        </button>
        <button className="fx-quick-card" onClick={() => go('seasonal')}>
          <span aria-hidden="true">🌦️</span>
          <strong>{t('Seasonal crops')}</strong>
          <small>{s ? t('What sells in {season} and who wants it', { season: t(s.current_season) }) : t('Kharif, Rabi and Zaid')}</small>
        </button>
      </div>

      <Notice msg={msg} />
      <div className="fx-two">
        <section className="fh-card">
          <div className="fx-card-head"><h3>{t('Orders needing action ({n})', { n: todo.length })}</h3><button className="fx-link-btn" onClick={() => go('orders')}>{t('All orders →')}</button></div>
          {orders.loading && <Loading what="orders" />}
          {!orders.loading && todo.length === 0 && <p className="fh-hint">{t('Nothing to do right now.')}</p>}
          {todo.map((o) => (
            <OrderRow key={o.id} order={o} isFarmer actions={<OrderActions order={o} setStatus={setStatus} onCosts={onCosts} />} />
          ))}
        </section>
        <section className="fh-card">
          <div className="fx-card-head"><h3>{user.district ? t('Buyer demand in {d}', { d: user.district }) : t('Buyer demand')}</h3><button className="fx-link-btn" onClick={() => go('demand')}>{t('See all →')}</button></div>
          {demand.loading && <Loading />}
          {!demand.loading && (demand.data || []).length === 0 && <p className="fh-hint">{t('No open buyer requirements nearby.')}</p>}
          {(demand.data || []).slice(0, 4).map((r) => (
            <div className="fh-item" key={r.id}>
              <span className="fh-emoji" aria-hidden="true">{emojiFor(r.category)}</span>
              <div className="fh-item-main">
                <strong>{r.product_name} — {r.quantity} {r.unit}</strong>
                <small>{r.buyer_name} · {timeLeft(r.expires_at, t)}</small>
              </div>
              <div className="fh-actions"><button onClick={() => onContact(r)}>{t('Contact')}</button></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Produce

const blank = {
  name: '', category: 'Vegetables', price: '', quantity: '', unit: 'kg', minimum_order: 1,
  cost_price: '', season: '', description: '', image_url: '', pool_enabled: false,
}

function PinPrompt({ onUserUpdate }) {
  const t = useT()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  async function save(e) {
    e.preventDefault()
    try {
      onUserUpdate(await api('/api/auth/me', { method: 'PATCH', body: { pincode: pin } }))
    } catch (ex) { setErr(ex.message) }
  }
  return (
    <form className="fx-pin" onSubmit={save}>
      <span>📮 {t('Add your village PIN code to pool with neighbours')}</span>
      <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="422202" inputMode="numeric" maxLength={6} aria-label={t('PIN code')} />
      <button>{t('Save')}</button>
      {err && <small className="fh-error">{err}</small>}
    </form>
  )
}

function Produce({ user, rk, refresh, onUserUpdate }) {
  const t = useT()
  const mine = useApi(`/api/products?farmer_id=${user.id}`, rk)
  const [form, setForm] = useState(blank)
  const [quality, setQuality] = useState(null)
  const [edit, setEdit] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const autoSeason = guessSeason(form.name)

  const run = async (fn, success) => {
    setMsg({ type: '', text: '' })
    try { await fn(); setMsg({ type: 'ok', text: success }); refresh() } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  async function pickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadImage(file)
      setForm((f) => ({ ...f, image_url: res.url }))
      setQuality(res.quality)
    } catch (err) { setMsg({ type: 'error', text: err.message }) } finally { setUploading(false) }
  }

  const voiceFill = (fields) => setForm((f) => ({
    ...f,
    ...(fields.name ? { name: fields.name } : {}),
    ...(fields.category ? { category: fields.category } : {}),
    ...(fields.quantity != null ? { quantity: String(fields.quantity) } : {}),
    ...(fields.unit && UNITS.includes(fields.unit) ? { unit: fields.unit } : {}),
    ...(fields.price != null ? { price: String(fields.price) } : {}),
  }))

  const add = (e) => {
    e.preventDefault()
    const body = { ...form }
    if (!body.season) delete body.season
    run(async () => { await api('/api/products', { method: 'POST', body }); setForm(blank); setQuality(null) },
      form.pool_enabled ? t('Product listed and added to your village pool!') : t('Product listed! Buyers can now see it.'))
  }
  const save = () => run(async () => {
    await api(`/api/products/${edit.id}`, {
      method: 'PUT',
      body: { price: edit.price, quantity: edit.quantity, cost_price: edit.cost_price, season: edit.season, pool_enabled: edit.pool_enabled },
    })
    setEdit(null)
  }, t('Product updated.'))
  const remove = (id) => window.confirm(t('Delete this product?')) && run(() => api(`/api/products/${id}`, { method: 'DELETE' }), t('Product deleted.'))

  return (
    <div className="fx-page">
      <PageHeader kicker={t('MY PRODUCE')} title={t('Your listings')} sub={t('Buyers see price, stock, season and photo grade. Your production cost stays private.')} />
      <Notice msg={msg} />
      <div className="fh-dash-grid fx-grid-wide">
        <form className="fh-card" onSubmit={add}>
          <h3>{t('List new produce')}</h3>
          <VoiceFill onFill={voiceFill} />
          <input aria-label={t('Product name')} placeholder={t('Product name * (e.g. Green Grapes)')} value={form.name} onChange={set('name')} required />
          <div className="fh-row">
            <select aria-label={t('Category')} value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
            <select aria-label={t('Unit')} value={form.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u} value={u}>{t(u)}</option>)}</select>
          </div>
          <div className="fh-row">
            <input aria-label={t('Price per unit')} type="number" min="0" step="any" placeholder={t('Price per {unit} (₹) *', { unit: t(form.unit) })} value={form.price} onChange={set('price')} required />
            <input aria-label={t('Quantity')} type="number" min="0" step="any" placeholder={t('Quantity *')} value={form.quantity} onChange={set('quantity')} required />
          </div>
          <MandiCard crop={form.name} district={user.district} state={user.state} price={form.price} unit={form.unit} />
          <div className="fh-row">
            <input aria-label={t('Minimum order')} type="number" min="0" step="any" placeholder={t('Minimum order')} value={form.minimum_order} onChange={set('minimum_order')} />
            <select aria-label={t('Crop season')} value={form.season} onChange={set('season')}>
              <option value="">{t('Season: auto ({s})', { s: t(autoSeason) })}</option>
              {SEASON_LIST.map((s) => <option key={s} value={s}>{t(s)} — {t(SEASON_HINT[s])}</option>)}
            </select>
          </div>
          <input aria-label={t('Production cost per unit')} type="number" min="0" step="any"
            placeholder={t('Your production cost per unit (₹, private — for profit)')} value={form.cost_price} onChange={set('cost_price')} />
          <label className="fh-upload">
            {form.image_url
              ? <img src={imgSrc(form.image_url)} alt={t('Preview')} />
              : <span>{uploading ? t('Uploading… checking quality') : t('📷 Add a photo — we grade it automatically (JPG/PNG/WEBP, max 3 MB)')}</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickImage} hidden />
          </label>
          {form.image_url && <button type="button" className="fh-link" onClick={() => { setForm((f) => ({ ...f, image_url: '' })); setQuality(null) }}>{t('Remove photo')}</button>}
          <QualityReport report={quality} />
          <label className={`fx-toggle ${form.pool_enabled ? 'on' : ''}`}>
            <input type="checkbox" checked={form.pool_enabled} onChange={(e) => setForm((f) => ({ ...f, pool_enabled: e.target.checked }))} />
            <span className="fx-toggle-ui" aria-hidden="true" />
            <span><strong>🤝 {t('Pool with nearby farmers')}</strong><small>{t('Same crop + same PIN code ({pin}) → one truckload for bulk buyers, shared transport.', { pin: user.pincode || '—' })}</small></span>
          </label>
          {form.pool_enabled && !user.pincode && <PinPrompt onUserUpdate={onUserUpdate} />}
          <textarea aria-label={t('Description')} placeholder={t('Description')} rows={2} value={form.description} onChange={set('description')} />
          <small className="fh-hint">{t('Location is taken from your profile ({d}, {s}).', { d: user.district || '—', s: user.state || '—' })}</small>
          <button className="fh-submit" disabled={uploading}>{t('Add product')}</button>
        </form>

        <section className="fh-card">
          <h3>{t('My products ({n})', { n: mine.data?.length ?? 0 })}</h3>
          {mine.loading && <Loading what="products" />}
          <ErrorNote error={mine.error} onRetry={mine.reload} />
          {mine.data?.length === 0 && <p className="fh-hint">{t('Nothing listed yet.')}</p>}
          {(mine.data || []).map((p) => (
            <div className="fh-item fx-prod-row" key={p.id}>
              {p.image_url ? <img className="fh-thumb" src={imgSrc(p.image_url)} alt="" /> : <span className="fh-emoji" aria-hidden="true">{emojiFor(p.category)}</span>}
              <div className="fh-item-main">
                <strong>{p.name} <SeasonBadge season={p.season} /> <QualityBadge grade={p.quality_grade} freshness={p.freshness_score} />
                  {p.pool_id ? <span className="fx-pool-tag">🤝 {t('In village pool')}</span> : p.pool_enabled ? <span className="fx-pool-tag muted">{t('Pool: waiting for a neighbour')}</span> : null}
                </strong>
                {edit?.id === p.id ? (
                  <>
                    <div className="fx-edit-grid">
                      <label>{t('Price ₹')}<input type="number" min="0" step="any" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></label>
                      <label>{t('Stock')}<input type="number" min="0" step="any" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} /></label>
                      <label>{t('Cost ₹/unit')}<input type="number" min="0" step="any" value={edit.cost_price} onChange={(e) => setEdit({ ...edit, cost_price: e.target.value })} /></label>
                      <label>{t('Season')}
                        <select value={edit.season} onChange={(e) => setEdit({ ...edit, season: e.target.value })}>
                          {SEASON_LIST.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                        </select>
                      </label>
                      <label className="fx-edit-check"><input type="checkbox" checked={edit.pool_enabled} onChange={(e) => setEdit({ ...edit, pool_enabled: e.target.checked })} /> {t('Pool')}</label>
                    </div>
                    <MandiCard crop={p.name} district={user.district} state={user.state} price={edit.price} unit={p.unit} />
                  </>
                ) : (
                  <small>
                    {money(p.price)}/{t(p.unit)} · {t('{q} {u} left', { q: p.quantity, u: t(p.unit) })}
                    {p.cost_price != null ? ` · ${t('cost')} ${money(p.cost_price)}/${t(p.unit)}` : ` · ${t('cost not set')}`}
                  </small>
                )}
              </div>
              <div className="fh-actions">
                {edit?.id === p.id ? (
                  <><button onClick={save}>{t('Save')}</button><button onClick={() => setEdit(null)}>{t('Cancel')}</button></>
                ) : (
                  <>
                    <button onClick={() => setEdit({ id: p.id, price: p.price, quantity: p.quantity, cost_price: p.cost_price ?? '', season: p.season, pool_enabled: p.pool_enabled })}>{t('Edit')}</button>
                    <button className="danger" onClick={() => remove(p.id)}>{t('Delete')}</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Orders

function Orders({ rk, refresh, onCosts }) {
  const t = useT()
  const orders = useApi('/api/orders', rk)
  const [filter, setFilter] = useState('all')
  const { msg, setStatus } = useOrderActions(refresh)
  const list = useMemo(() => orders.data || [], [orders.data])
  const counts = useMemo(() => {
    const c = { all: list.length }
    for (const o of list) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [list])
  const shown = filter === 'all' ? list : list.filter((o) => o.status === filter)

  return (
    <div className="fx-page">
      <PageHeader kicker={t('ORDERS')} title={t('Orders from buyers')}
        sub={t('Buyers pay into escrow first. You get 70% when the goods are picked up and the rest when the buyer gives you the delivery OTP.')} />
      <StatusFilter value={filter} onChange={setFilter} counts={counts} />
      <Notice msg={msg} />
      <section className="fh-card fx-wide">
        {orders.loading && <Loading what="orders" />}
        <ErrorNote error={orders.error} onRetry={orders.reload} />
        {!orders.loading && shown.length === 0 && <p className="fh-hint">{t('No orders here.')}</p>}
        {shown.map((o) => (
          <OrderRow key={o.id} order={o} isFarmer actions={<OrderActions order={o} setStatus={setStatus} onCosts={onCosts} />} />
        ))}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- Buyer demand

function Demand({ user, rk, onContact }) {
  const t = useT()
  const [scope, setScope] = useState(user.district ? 'district' : 'all')
  const all = useApi('/api/requirements', rk)
  const list = (all.data || []).filter((r) =>
    scope === 'all' || (r.district || '').toLowerCase() === (user.district || '').toLowerCase())

  return (
    <div className="fx-page">
      <PageHeader kicker={t('BUYER DEMAND')} title={t('What buyers want')}
        sub={t('Open requirements posted by buyers. Contact them directly — their phone is visible only to farmers.')} />
      <div className="fx-chips" role="group" aria-label={t('Area')}>
        {user.district && <button className={scope === 'district' ? 'active' : ''} onClick={() => setScope('district')}>{t('In {d}', { d: user.district })}</button>}
        <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{t('All India')}</button>
      </div>
      <section className="fh-card fx-wide">
        <h3>{t('Open requirements ({n})', { n: list.length })}</h3>
        {all.loading && <Loading />}
        <ErrorNote error={all.error} onRetry={all.reload} />
        {!all.loading && list.length === 0 && <p className="fh-hint">{t('No open requirements here right now.')}</p>}
        {list.map((r) => (
          <div className="fh-item" key={r.id}>
            <span className="fh-emoji" aria-hidden="true">{emojiFor(r.category)}</span>
            <div className="fh-item-main">
              <strong>{r.product_name} — {r.quantity} {r.unit}</strong>
              <small>
                {r.buyer_name} · {r.district || r.state || '—'} · {timeLeft(r.expires_at, t)}
                {r.max_price != null ? ` · ${t('up to')} ${money(r.max_price)}/${r.unit}` : ''}
              </small>
            </div>
            <SeasonBadge season={r.season} />
            <div className="fh-actions"><button onClick={() => onContact(r)}>{t('Contact')}</button></div>
          </div>
        ))}
      </section>
      <h3 className="fx-section-title">{t('Explore demand on the map')}</h3>
      <RegionalMap mode="farmer" liveRequirements={all.data || []} onContact={onContact} homeState={user.state} homeDistrict={user.district} />
    </div>
  )
}
