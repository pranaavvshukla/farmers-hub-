import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IndiaMap } from 'vardhan-maps/react'
import { emojiFor, money, timeLeft, useApi } from './api'
import Combobox from './Combobox'
import { useT } from './i18n'
import { canonicalState, districtsOf, STATES } from './india'

// A few sample listings so states without live data still show something in the demo.
const SAMPLES = [
  { state: 'Maharashtra', district: 'Nashik', type: 'supply', product: 'Green Grapes', emoji: '🍇', person: 'Patil Farms', quantity: '2,500 kg', price: '₹38/kg', detail: 'Minimum order: 50 kg', location: 'Dindori, Nashik' },
  { state: 'Maharashtra', district: 'Pune', type: 'demand', product: 'Onions', emoji: '🧅', person: 'AgroFresh Traders', quantity: '2,500 kg required', price: '₹18–₹22/kg', detail: 'Required within 5 days', location: 'Pune' },
  { state: 'Punjab', district: 'Ludhiana', type: 'supply', product: 'Wheat', emoji: '🌾', person: 'Gill Farms', quantity: '4,000 kg', price: '₹24/kg', detail: 'Minimum order: 200 kg', location: 'Ludhiana' },
  { state: 'Punjab', district: 'Amritsar', type: 'demand', product: 'Wheat', emoji: '🌾', person: 'Punjab Grain Traders', quantity: '6,000 kg required', price: '₹23–₹27/kg', detail: 'Required within 10 days', location: 'Amritsar' },
  { state: 'Jammu and Kashmir', district: 'Baramulla', type: 'supply', product: 'Walnuts', emoji: '🌰', person: 'Mountain Harvest', quantity: '800 kg', price: '₹220/kg', detail: 'Minimum order: 25 kg', location: 'Baramulla' },
  { state: 'Assam', district: 'Dibrugarh', type: 'supply', product: 'Tea Leaves', emoji: '🍃', person: 'Green Valley Tea', quantity: '1,200 kg', price: '₹90/kg', detail: 'Minimum order: 50 kg', location: 'Dibrugarh' },
  { state: 'Assam', district: 'Kamrup Metropolitan', type: 'demand', product: 'Rice', emoji: '🍚', person: 'Assam Food Traders', quantity: '3,000 kg required', price: '₹28–₹32/kg', detail: 'Required within 8 days', location: 'Kamrup' },
  { state: 'Chhattisgarh', district: 'Bilaspur', type: 'demand', product: 'Paddy (Dhan)', emoji: '🌾', person: 'Bilaspur Rice Mill', quantity: '20 quintal required', price: '₹2,400–₹2,500/quintal', detail: 'Required within 10 days', location: 'Tifra, Bilaspur' },
  { state: 'Chhattisgarh', district: 'Kabirdham', type: 'supply', product: 'Soybean', emoji: '🫘', person: 'Kawardha Kisan Samooh', quantity: '40 quintal', price: '₹4,600/quintal', detail: 'Minimum order: 5 quintal', location: 'Kawardha' },
]
const FEATURED = ['Chhattisgarh', 'Maharashtra', 'Punjab', 'Madhya Pradesh', 'Uttar Pradesh', 'Karnataka']
// Map data names some districts "Nashik District"; users and listings just say "Nashik".
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+district$/, '')
const same = (a, b) => norm(a) === norm(b)

// District mandi board: modal price per crop + Govt MSP (live AGMARKNET when a key is set).
function MandiBoard({ state, district }) {
  const t = useT()
  const q = new URLSearchParams({ state, district: district || '' })
  const res = useApi(state ? `/api/mandi-board?${q}` : null)
  const rows = res.data?.rows || []
  const live = res.data?.live
  return (
    <div className="rd-mandi">
      <div className="rd-mandi-head">
        <strong>📊 {t('Mandi prices & MSP')} · {district || state}</strong>
        {rows[0] && <span className={`fx-mandi-src ${rows[0].source}`}>{rows[0].source === 'live' ? t('Live · AGMARKNET') : t('Cached rates · {date}', { date: rows[0].as_of })}</span>}
      </div>
      {res.loading && <p className="fh-hint">{t('Checking mandi rates…')}</p>}
      {!res.loading && rows.length === 0 && <p className="fh-hint">{t('No mandi price data for this area yet.')}</p>}
      {rows.length > 0 && (
        <div className="rd-mandi-table">
          <div className="rd-mandi-row head"><span>{t('Crop')}</span><span>{t('Mandi')}</span><span>{t('Modal price')}</span><span>{t('Govt MSP')}</span></div>
          {rows.slice(0, 10).map((r) => (
            <div className="rd-mandi-row" key={`${r.crop}-${r.market}`}>
              <span><b>{t(r.crop)}</b></span>
              <span className="rd-mandi-market">{r.market}{r.scope === 'state' ? ` · ${t('state avg')}` : ''}</span>
              <span>{money(r.modal_per_quintal)}<small>/q · {money(r.modal_per_quintal / 100)}/kg</small></span>
              <span>{r.msp_per_quintal ? <>{money(r.msp_per_quintal)}<small>/q</small></> : <small>{t('No MSP')}</small>}</span>
            </div>
          ))}
        </div>
      )}
      {live && !live.enabled && <small className="rd-mandi-note">{t('Showing cached rates. Add a free data.gov.in API key in backend/.env (DATA_GOV_API_KEY) for live AGMARKNET prices.')}</small>}
      {live?.enabled && live.last_error && <small className="rd-mandi-note">{t('Live AGMARKNET is not answering right now ({err}); showing cached rates.', { err: live.last_error })}</small>}
    </div>
  )
}

// mode "buyer" = farmer supply on the map, mode "farmer" = buyer demand.
// The mode comes from the logged-in role, so nobody sees the other side's view.
export default function RegionalMap({ mode, liveProducts = [], liveRequirements = [], onOrder, onContact, homeState, homeDistrict }) {
  const t = useT()
  const isBuyer = mode === 'buyer'
  const live = useMemo(() => (isBuyer ? liveProducts.filter((p) => p.quantity > 0) : liveRequirements), [isBuyer, liveProducts, liveRequirements])

  // Live listings per state and per district, to highlight where the action is.
  const activity = useMemo(() => {
    const byState = {}
    for (const item of live) {
      const st = canonicalState(item.state)
      if (!st) continue
      byState[st] ||= {}
      const d = item.district || '—'
      byState[st][d] = (byState[st][d] || 0) + 1
    }
    return byState
  }, [live])

  const startState = canonicalState(homeState) || 'Chhattisgarh'
  const firstDistrict = (st) => {
    const act = Object.entries(activity[st] || {}).sort((a, b) => b[1] - a[1])[0]?.[0]
    return act && districtsOf(st).some((d) => same(d, act)) ? districtsOf(st).find((d) => same(d, act)) : districtsOf(st)[0] || ''
  }
  const [mapLevel, setMapLevel] = useState('state')
  const [selectedState, setSelectedState] = useState(startState)
  const [selectedDistrict, setSelectedDistrict] = useState(() =>
    (homeDistrict && districtsOf(startState).find((d) => same(d, homeDistrict))) || districtsOf(startState)[0] || '')

  function chooseState(name) {
    const st = canonicalState(name)
    if (!st) return
    setSelectedState(st)
    setSelectedDistrict(firstDistrict(st))
    setMapLevel('district')
  }
  function chooseDistrict(name) {
    const d = districtsOf(selectedState).find((x) => same(x, name)) || name
    setSelectedDistrict(d)
  }

  const visibleListings = useMemo(() => {
    const inArea = (item) => same(canonicalState(item.state), selectedState) && same(item.district, selectedDistrict)
    const liveCards = live.filter(inArea).map((x) => (isBuyer ? {
      live: true, ref: x, product: x.name, emoji: emojiFor(x.category), person: x.farmer_name,
      quantity: `${x.quantity} ${t(x.unit)}`, price: `₹${x.price}/${t(x.unit)}`,
      detail: t('min {q} {u}', { q: x.minimum_order, u: t(x.unit) }), location: x.location || x.district,
      rating: x.farmer_rating, grade: x.quality_grade,
    } : {
      live: true, ref: x, product: x.product_name, emoji: emojiFor(x.category), person: x.buyer_name,
      quantity: t('{q} {u} required', { q: x.quantity, u: t(x.unit) }),
      price: x.min_price != null && x.max_price != null ? `₹${x.min_price}–₹${x.max_price}/${t(x.unit)}`
        : x.max_price != null ? t('Up to {price} / {unit}', { price: `₹${x.max_price}`, unit: t(x.unit) }) : t('Open to offers'),
      detail: timeLeft(x.expires_at, t), location: x.location || x.district,
    }))
    const demo = SAMPLES.filter((s) => s.type === (isBuyer ? 'supply' : 'demand') && same(s.state, selectedState) && same(s.district, selectedDistrict))
    return [...liveCards, ...demo]
  }, [live, isBuyer, selectedState, selectedDistrict, t])

  const stateActivity = Object.entries(activity[selectedState] || {}).sort((a, b) => b[1] - a[1])
  const activeStates = Object.keys(activity)
  const chips = [...new Set([...activeStates, ...FEATURED])].slice(0, 8)

  return (
    <section className="regional-discovery fx-map" id="regional-discovery">
      <div className="rd-content">
        <div className="rd-map-panel">
          <div className="rd-panel-heading">
            <div>
              <span className="rd-step-label">{mapLevel === 'state' ? t('SELECT REGION') : t('SELECT DISTRICT')}</span>
              <h3>{mapLevel === 'state' ? t('Explore India') : selectedState}</h3>
              <p>{mapLevel === 'state' ? t('Click any state on the map to open its districts') : t('Click a district to see local listings and mandi prices')}</p>
            </div>
            {mapLevel === 'district' && (
              <button className="rd-back-button" onClick={() => setMapLevel('state')}>← {t('India')}</button>
            )}
          </div>
          <div className="rd-map-container">
            <IndiaMap
              key={mapLevel === 'state' ? 'india' : selectedState}
              level={mapLevel === 'state' ? 'state' : 'district'}
              stateName={mapLevel === 'district' ? selectedState : undefined}
              resolution="high"
              tooltip
              onStateClick={chooseState}
              onDistrictClick={chooseDistrict}
            />
          </div>
          <div className="rd-pickers">
            <Combobox label={t('State')} value={selectedState} options={STATES} allowCustom={false}
              placeholder={t('Type or pick a state')} onChange={chooseState} />
            <Combobox label={t('District')} value={selectedDistrict} options={districtsOf(selectedState)} allowCustom={false}
              placeholder={t('Type or pick a district')} onChange={(d) => { chooseDistrict(d); setMapLevel('district') }} />
          </div>
          <div className="rd-quick-regions">
            <span className="rd-step-label">{t('QUICK EXPLORE')}</span>
            <div className="rd-region-chips">
              {chips.map((s) => (
                <button key={s} className={selectedState === s ? 'active' : ''} onClick={() => chooseState(s)}>
                  {s}{activity[s] ? <b className="rd-chip-count">{Object.values(activity[s]).reduce((a, b) => a + b, 0)}</b> : null}
                </button>
              ))}
            </div>
          </div>
          {stateActivity.length > 0 && (
            <div className="rd-quick-regions">
              <span className="rd-step-label">{t('ACTIVE DISTRICTS IN {state}', { state: selectedState.toUpperCase() })}</span>
              <div className="rd-region-chips">
                {stateActivity.map(([d, n]) => (
                  <button key={d} className={same(selectedDistrict, d) ? 'active' : ''} onClick={() => { chooseDistrict(d); setMapLevel('district') }}>
                    📍 {d} <b className="rd-chip-count">{n}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rd-results-panel">
          <div className="rd-results-header">
            <div>
              <span className="rd-results-label">{isBuyer ? t('FARMER SUPPLY') : t('BUYER REQUIREMENTS')}</span>
              <h3>{selectedDistrict ? `${selectedDistrict}, ` : ''}{selectedState}</h3>
              <p>{isBuyer ? t('Available produce from local farmers') : t('What buyers are looking to purchase')}</p>
            </div>
            <span className="rd-location-icon">📍</span>
          </div>

          <MandiBoard state={selectedState} district={selectedDistrict} />

          <div className="rd-listing-count">
            <span>{t('{n} listings found', { n: visibleListings.length })}</span>
            {visibleListings.length > 0 && <span className="rd-demo-label">{visibleListings.some((i) => i.live) ? (visibleListings.every((i) => i.live) ? t('LIVE') : t('LIVE + SAMPLE')) : t('SAMPLE DATA')}</span>}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`${selectedState}-${selectedDistrict}`} className="rd-listings"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {visibleListings.length > 0 ? visibleListings.map((item) => (
                <article className="rd-listing-card" key={`${item.live ? 'live' : 'demo'}-${item.person}-${item.product}`}>
                  <div className="rd-product-emoji">{item.emoji}</div>
                  <div className="rd-listing-main">
                    <div className="rd-product-title-row">
                      <h4>{item.product}{item.live && <span className="rd-live">{t('LIVE')}</span>}</h4>
                      <span className={`rd-status ${isBuyer ? 'supply-status' : 'demand-status'}`}>{isBuyer ? t('Available') : t('Required')}</span>
                    </div>
                    <p className="rd-person">{item.person}{item.rating ? <span className="fx-mini-star"> ★{item.rating}</span> : null}</p>
                    <p className="rd-location">📍 {item.location}</p>
                    <div className="rd-listing-details">
                      <div><small>{t('QUANTITY')}</small><strong>{item.quantity}</strong></div>
                      <div><small>{isBuyer ? t('ASKING PRICE') : t('OFFER RANGE')}</small><strong>{item.price}</strong></div>
                    </div>
                    <p className="rd-extra">{item.detail}</p>
                    {item.live ? (
                      <button className="rd-connect-button" onClick={() => (isBuyer ? onOrder(item.ref) : onContact(item.ref))}>
                        {isBuyer ? t('Order now') : t('Contact buyer')} <span>→</span>
                      </button>
                    ) : (
                      <p className="fh-hint">{t('Sample listing for the demo')}</p>
                    )}
                  </div>
                </article>
              )) : (
                <div className="rd-empty">
                  <span>🌱</span>
                  <h4>{t('No listings in this district yet')}</h4>
                  <p>{stateActivity.length ? t('Try a highlighted district on the left.') : t('Try another district or state.')}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <p className="rd-disclaimer">{t('* LIVE listings are real; the rest are sample data. Map boundaries © OpenStreetMap contributors.')}</p>
    </section>
  )
}
