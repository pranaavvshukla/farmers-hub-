import { useCallback, useMemo, useState } from 'react'
import {
  api, CATEGORIES, emojiFor, guessSeason, money, SEASON_HINT, SEASON_LIST, timeLeft, UNITS, useApi, useHashTab,
} from './api'
import BuyerProfile from './BuyerProfile'
import EscrowPayModal from './Escrow'
import Finance from './Finance'
import { useT } from './i18n'
import Marketplace, { OrderModal } from './Marketplace'
import PoolsSection from './Pools'
import RegionalMap from './RegionalMap'
import { ReviewModal, Stars } from './Reviews'
import SeasonalCrops from './SeasonalCrops'
import Shell from './Shell'
import { ErrorNote, Loading, Notice, OrderRow, PageHeader, SeasonBadge, Stat, StatusFilter } from './Widgets'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'marketplace', label: 'Marketplace', icon: '🛍️' },
  { id: 'orders', label: 'My orders', icon: '📦' },
  { id: 'requirements', label: 'My requirements', icon: '📢' },
  { id: 'seasonal', label: 'Seasonal crops', icon: '🌦️' },
  { id: 'spending', label: 'Spending', icon: '💸' },
  { id: 'business', label: 'Business profile', icon: '🛡️' },
]
const TAB_IDS = TABS.map((t) => t.id)

export default function BuyerApp({ user, onLogout, onUserUpdate, onLanguage }) {
  const t = useT()
  const [tab, go] = useHashTab(TAB_IDS, 'overview')
  const [rk, setRk] = useState(0)
  const refresh = useCallback(() => setRk((k) => k + 1), [])
  const [ordering, setOrdering] = useState(null)
  const [paying, setPaying] = useState(null)
  const [reviewing, setReviewing] = useState(null)
  const [note, setNote] = useState({ type: '', text: '' })
  const seasons = useApi('/api/seasons', rk)
  const currentSeason = seasons.data?.current

  const cancel = async (order) => {
    if (!window.confirm(t('Cancel this order?'))) return
    try {
      const res = await api(`/api/orders/${order.id}/cancel`, { method: 'PATCH', full: true })
      setNote({ type: 'ok', text: res.message })
      refresh()
    } catch (err) { setNote({ type: 'error', text: err.message }) }
  }
  const actions = { onPay: setPaying, onReview: setReviewing, onCancel: cancel }
  const shared = { user, rk, refresh, go, onOrder: setOrdering, actions, note, currentSeason }

  return (
    <Shell user={user} tabs={TABS} active={tab} onTab={go} onLogout={onLogout} onLanguage={onLanguage}>
      {tab === 'overview' && <Overview {...shared} />}
      {tab === 'marketplace' && <Market {...shared} />}
      {tab === 'orders' && <Orders {...shared} />}
      {tab === 'requirements' && <Requirements {...shared} />}
      {tab === 'seasonal' && <SeasonalCrops role="buyer" user={user} rk={rk} onOrder={setOrdering} />}
      {tab === 'spending' && <Finance role="buyer" rk={rk} refresh={refresh} />}
      {tab === 'business' && <BuyerProfile user={user} onUserUpdate={onUserUpdate} />}
      {ordering && <OrderModal product={ordering} user={user} onClose={() => setOrdering(null)} onDone={refresh} />}
      {paying && <EscrowPayModal orders={paying} onClose={() => setPaying(null)} onPaid={refresh} />}
      {reviewing && <ReviewModal order={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); setNote({ type: 'ok', text: t('Thank you! Your review helps other buyers.') }); refresh() }} />}
    </Shell>
  )
}

// Buttons on a buyer's order: pay into escrow, or show the delivery OTP.
function BuyerOrderExtra({ order, actions }) {
  const t = useT()
  const { onPay, onReview, onCancel } = actions
  const cancelBtn = order.status === 'pending' && <button className="fx-ghost-danger" onClick={() => onCancel(order)}>{t('Cancel order')}</button>
  if (order.status === 'completed') {
    return order.review_rating
      ? <div className="fx-order-extra done"><span>{t('Your rating')}</span><Stars value={order.review_rating} /></div>
      : (
        <div className="fx-order-extra rate">
          <span>{t('Delivered. How was it?')}</span>
          <button className="fx-primary" onClick={() => onReview(order)}>★ {t('Rate farmer')}</button>
        </div>
      )
  }
  if (['pending', 'accepted'].includes(order.status) && order.escrow_status === 'UNPAID') {
    return (
      <div className="fx-order-extra">
        <span>{t('Pay into escrow so the farmer can dispatch.')}</span>
        <div className="fx-extra-btns">
          {cancelBtn}
          <button className="fx-primary" onClick={() => onPay([order])}>🔒 {t('Pay {amount}', { amount: money(order.total_price) })}</button>
        </div>
      </div>
    )
  }
  if (order.delivery_otp) {
    return (
      <div className="fx-order-extra otp">
        <span>{t('Delivery OTP — share only when the goods arrive:')}</span>
        <div className="fx-extra-btns"><b className="fx-otp-inline">{order.delivery_otp}</b>{cancelBtn}</div>
      </div>
    )
  }
  return null
}

// ---------------------------------------------------------------- Overview

function Overview({ user, rk, go, onOrder, actions, note, currentSeason }) {
  const t = useT()
  const stats = useApi('/api/stats', rk)
  const orders = useApi('/api/orders', rk)
  const fresh = useApi(currentSeason ? `/api/products?season=${encodeURIComponent(currentSeason)}` : null, rk)
  const s = stats.data
  const inSeason = (fresh.data || []).filter((p) => p.quantity > 0).slice(0, 4)

  return (
    <div className="fx-page">
      <PageHeader kicker={t('BUYER DASHBOARD')} title={t('Hello, {name} 👋', { name: user.name })}
        sub={currentSeason ? t('It is {season} season ({hint}).', { season: t(currentSeason), hint: t(SEASON_HINT[currentSeason]) }) : t('Buy fresh, directly from farms.')} />
      {!user.kyb_verified && !user.flagged_middleman && (
        <button className="fx-kyb-nudge" onClick={() => go('business')}>🛡️ {t('Verify your business (GSTIN + FSSAI) to get a trusted badge on every order')} →</button>
      )}
      {user.flagged_middleman && <div className="fh-note fh-error">⚠ {t('Your account is under review')}: {user.flag_reason}</div>}
      <Notice msg={note} />
      <ErrorNote error={stats.error} onRetry={stats.reload} />
      {s ? (
        <div className="fh-stats">
          <Stat icon="💸" label={t('Spent (accepted + completed)')} value={money(s.total_spent)} tone="good" onClick={() => go('spending')} />
          <Stat icon="🔒" label={t('In escrow')} value={money(s.in_escrow)} hint={t('Released to farmers on pickup and delivery')} onClick={() => go('orders')} />
          <Stat icon="💳" label={t('Awaiting your payment')} value={s.awaiting_payment} tone={s.awaiting_payment ? 'accent' : ''} onClick={() => go('orders')} />
          <Stat icon="📢" label={t('Open requirements')} value={s.open_requirements} onClick={() => go('requirements')} />
        </div>
      ) : <Loading what="stats" />}

      <div className="fx-quick">
        <button className="fx-quick-card fx-quick-main" onClick={() => go('marketplace')}>
          <span aria-hidden="true">🛍️</span>
          <strong>{t('Browse marketplace →')}</strong>
          <small>{t('Village bulk pools, graded produce, mandi price reference')}</small>
        </button>
        <button className="fx-quick-card" onClick={() => go('requirements')}>
          <span aria-hidden="true">📢</span>
          <strong>{t('Post a requirement')}</strong>
          <small>{t('Tell nearby farmers what you need, by when and at what price')}</small>
        </button>
        <button className="fx-quick-card" onClick={() => go('spending')}>
          <span aria-hidden="true">💸</span>
          <strong>{t('Spending dashboard')}</strong>
          <small>{t('What you buy most, monthly, quarterly and yearly')}</small>
        </button>
      </div>

      <div className="fx-two">
        <section className="fh-card">
          <div className="fx-card-head"><h3>{t('In season now')}{currentSeason ? ` (${t(currentSeason)})` : ''}</h3><button className="fx-link-btn" onClick={() => go('seasonal')}>{t('Seasonal crops →')}</button></div>
          {fresh.loading && <Loading />}
          {!fresh.loading && inSeason.length === 0 && <p className="fh-hint">{t('No live listings for this season yet.')}</p>}
          {inSeason.map((p) => (
            <div className="fh-item" key={p.id}>
              <span className="fh-emoji" aria-hidden="true">{emojiFor(p.category)}</span>
              <div className="fh-item-main">
                <strong>{p.name}</strong>
                <small>{p.farmer_name} · {p.district} · {money(p.price)}/{t(p.unit)}</small>
              </div>
              <div className="fh-actions"><button onClick={() => onOrder(p)}>{t('Order')}</button></div>
            </div>
          ))}
        </section>
        <section className="fh-card">
          <div className="fx-card-head"><h3>{t('Recent orders')}</h3><button className="fx-link-btn" onClick={() => go('orders')}>{t('All orders →')}</button></div>
          {orders.loading && <Loading what="orders" />}
          {!orders.loading && (orders.data || []).length === 0 && <p className="fh-hint">{t('No orders yet — browse the marketplace.')}</p>}
          {(orders.data || []).slice(0, 4).map((o) => <OrderRow key={o.id} order={o} extra={<BuyerOrderExtra order={o} actions={actions} />} />)}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Marketplace

function Market({ user, rk, refresh, onOrder, currentSeason }) {
  const t = useT()
  const products = useApi('/api/products', rk)
  const reqs = useApi('/api/requirements', rk)
  const list = products.data || []
  return (
    <div className="fx-page">
      <PageHeader kicker={t('MARKETPLACE')} title={t('Fresh from the farm')} sub={t('Real listings posted by farmers. Order directly, no middleman.')} />
      <PoolsSection user={user} rk={rk} onDone={refresh} />
      <h3 className="fx-section-title">{t('Individual listings')}</h3>
      <Marketplace products={list} loading={products.loading} error={products.error}
        currentSeason={currentSeason} onOrder={onOrder} onRetry={products.reload} />
      <h3 className="fx-section-title">{t('Explore supply by region')}</h3>
      <RegionalMap mode="buyer" liveProducts={list} liveRequirements={reqs.data || []} onOrder={onOrder} homeState={user.state} homeDistrict={user.district} />
    </div>
  )
}

// ---------------------------------------------------------------- Orders

function Orders({ rk, actions, note }) {
  const t = useT()
  const orders = useApi('/api/orders', rk)
  const [filter, setFilter] = useState('all')
  const list = useMemo(() => orders.data || [], [orders.data])
  const counts = useMemo(() => {
    const c = { all: list.length }
    for (const o of list) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [list])
  const shown = filter === 'all' ? list : list.filter((o) => o.status === filter)
  const unpaid = list.filter((o) => ['pending', 'accepted'].includes(o.status) && o.escrow_status === 'UNPAID')
  return (
    <div className="fx-page">
      <PageHeader kicker={t('MY ORDERS')} title={t('Track your orders')}
        sub={t('Pay into escrow → farmer picks up (70% released) → you share the OTP on delivery (100% settled).')}
        action={unpaid.length > 1 && <button className="fx-primary" onClick={() => actions.onPay(unpaid)}>🔒 {t('Pay all {n} unpaid ({amount})', { n: unpaid.length, amount: money(unpaid.reduce((s, o) => s + o.total_price, 0)) })}</button>} />
      <StatusFilter value={filter} onChange={setFilter} counts={counts} />
      <Notice msg={note} />
      <section className="fh-card fx-wide">
        {orders.loading && <Loading what="orders" />}
        <ErrorNote error={orders.error} onRetry={orders.reload} />
        {!orders.loading && shown.length === 0 && <p className="fh-hint">{t('No orders here.')}</p>}
        {shown.map((o) => <OrderRow key={o.id} order={o} extra={<BuyerOrderExtra order={o} actions={actions} />} />)}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- Requirements

const blankReq = {
  product_name: '', category: 'Vegetables', quantity: '', unit: 'kg', min_price: '', max_price: '',
  needed_within_days: 7, season: '', description: '',
}

function Requirements({ user, rk, refresh }) {
  const t = useT()
  const mine = useApi(`/api/requirements?buyer_id=${user.id}`, rk)
  const [form, setForm] = useState(blankReq)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const run = async (fn, success) => {
    setMsg({ type: '', text: '' })
    try { await fn(); setMsg({ type: 'ok', text: success }); refresh() } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }
  const add = (e) => {
    e.preventDefault()
    const body = { ...form }
    if (!body.season) delete body.season
    run(async () => { await api('/api/requirements', { method: 'POST', body }); setForm(blankReq) }, t('Requirement posted! Farmers nearby can now see it.'))
  }
  const setStatus = (id, status) => run(() => api(`/api/requirements/${id}/status`, { method: 'PATCH', body: { status } }), status === 'closed' ? t('Requirement closed.') : t('Requirement reopened.'))
  const remove = (id) => window.confirm(t('Delete this requirement?')) && run(() => api(`/api/requirements/${id}`, { method: 'DELETE' }), t('Requirement deleted.'))

  return (
    <div className="fx-page">
      <PageHeader kicker={t('MY REQUIREMENTS')} title={t('Tell farmers what you need')} sub={t('Farmers in your district see this on their dashboard and map, and can call you.')} />
      <Notice msg={msg} />
      <div className="fh-dash-grid fx-grid-wide">
        <form className="fh-card" onSubmit={add}>
          <h3>{t('Post what you need')}</h3>
          <input aria-label={t('Product needed')} placeholder={t('What do you need? (e.g. Green Grapes) *')} value={form.product_name} onChange={set('product_name')} required />
          <div className="fh-row">
            <select aria-label={t('Category')} value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
            <select aria-label={t('Unit')} value={form.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u} value={u}>{t(u)}</option>)}</select>
          </div>
          <div className="fh-row">
            <input aria-label={t('Quantity needed')} type="number" min="0" step="any" placeholder={t('Quantity needed *')} value={form.quantity} onChange={set('quantity')} required />
            <input aria-label={t('Needed within days')} type="number" min="1" placeholder={t('Needed within (days)')} value={form.needed_within_days} onChange={set('needed_within_days')} />
          </div>
          <div className="fh-row">
            <input aria-label={t('Minimum price')} type="number" min="0" step="any" placeholder={t('Min price ₹')} value={form.min_price} onChange={set('min_price')} />
            <input aria-label={t('Maximum price')} type="number" min="0" step="any" placeholder={t('Max price ₹')} value={form.max_price} onChange={set('max_price')} />
          </div>
          <select aria-label={t('Crop season')} value={form.season} onChange={set('season')}>
            <option value="">{t('Season: auto ({s})', { s: t(guessSeason(form.product_name)) })}</option>
            {SEASON_LIST.map((s) => <option key={s} value={s}>{t(s)} — {t(SEASON_HINT[s])}</option>)}
          </select>
          <textarea aria-label={t('Details')} placeholder={t('Details (quality, packaging, delivery…)')} rows={2} value={form.description} onChange={set('description')} />
          <small className="fh-hint">{t('Location is taken from your profile ({d}, {s}).', { d: user.district || '—', s: user.state || '—' })}</small>
          <button className="fh-submit">{t('Post requirement')}</button>
        </form>

        <section className="fh-card">
          <h3>{t('My requirements ({n})', { n: mine.data?.length ?? 0 })}</h3>
          {mine.loading && <Loading />}
          <ErrorNote error={mine.error} onRetry={mine.reload} />
          {mine.data?.length === 0 && <p className="fh-hint">{t("You haven't posted anything yet.")}</p>}
          {(mine.data || []).map((r) => (
            <div className="fh-item" key={r.id}>
              <span className="fh-emoji" aria-hidden="true">{emojiFor(r.category)}</span>
              <div className="fh-item-main">
                <strong>{r.product_name} — {r.quantity} {r.unit}</strong>
                <small>{r.active ? timeLeft(r.expires_at, t) : r.status === 'closed' ? t('Closed') : t('Expired')}</small>
              </div>
              <SeasonBadge season={r.season} />
              <div className="fh-actions">
                {r.status === 'open'
                  ? <button onClick={() => setStatus(r.id, 'closed')}>{t('Close')}</button>
                  : <button onClick={() => setStatus(r.id, 'open')}>{t('Reopen')}</button>}
                <button className="danger" onClick={() => remove(r.id)}>{t('Delete')}</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
