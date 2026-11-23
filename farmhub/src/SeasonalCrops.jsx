import { useState } from 'react'
import { emojiFor, imgSrc, money, SEASON_HINT, timeLeft, useApi } from './api'
import { useT } from './i18n'
import { ErrorNote, Loading, PageHeader, SeasonBadge } from './Widgets'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Shared by both apps. Farmers see what to grow/sell and buyer demand for the
// season; buyers see which produce is in season and can order it.
export default function SeasonalCrops({ role, user, rk, onOrder, onContact }) {
  const t = useT()
  const isFarmer = role === 'farmer'
  const seasons = useApi('/api/seasons', rk)
  const [picked, setPicked] = useState(null)
  const season = picked || seasons.data?.current
  const enc = season ? encodeURIComponent(season) : ''

  const items = useApi(season ? (isFarmer ? `/api/requirements?season=${enc}` : `/api/products?season=${enc}`) : null, rk)
  const mine = useApi(isFarmer && season ? `/api/products?farmer_id=${user.id}&season=${enc}` : null, rk)

  if (seasons.loading) return <Loading what="seasons" />
  if (seasons.error) return <ErrorNote error={seasons.error} onRetry={seasons.reload} />

  const all = seasons.data.seasons
  const info = all.find((s) => s.key === season)
  const list = items.data || []
  const available = isFarmer ? list : list.filter((p) => p.quantity > 0)
  const now = seasons.data.current

  return (
    <div className="fx-page">
      <PageHeader
        kicker={t('SEASONAL CROPS')}
        title={isFarmer ? t('Plan by season') : t("What's in season")}
        sub={t('Right now it is {season} season ({hint}). Pick a season to explore.', { season: t(now), hint: t(SEASON_HINT[now]) })}
      />

      <div className="fx-season-tabs" role="tablist" aria-label={t('Crop season')}>
        {all.map((s) => (
          <button key={s.key} role="tab" aria-selected={s.key === season}
            className={`fx-season-tab ${s.key === season ? 'active' : ''}`} onClick={() => setPicked(s.key)}>
            <span className="fx-season-tab-top">
              <strong>{t(s.key)}</strong>
              {s.is_current && <span className="fx-now">{t('Now')}</span>}
            </span>
            <small>{t(SEASON_HINT[s.key])}</small>
            <small>{isFarmer ? t('{n} buyer requests', { n: s.open_requirements }) : t('{n} live listings', { n: s.live_listings })}</small>
          </button>
        ))}
      </div>

      {info && (
        <div className="fx-two">
          <section className="fh-card">
            <h3>{t(info.label)}</h3>
            <dl className="fx-facts">
              <div><dt>{t('Sowing')}</dt><dd>{info.sowing}</dd></div>
              <div><dt>{t('Harvest / market')}</dt><dd>{info.harvest}</dd></div>
              <div><dt>{t('Months')}</dt><dd>{info.months.length ? info.months.map((m) => t(MONTH[m - 1])).join(', ') : t('Any month')}</dd></div>
            </dl>
            <p className="fh-hint">{isFarmer ? t('Common crops to grow or sell this season:') : t('Usually fresh and well priced this season:')}</p>
            <div className="fx-crop-chips">
              {info.crops.map((c) => <span key={c}>{t(c)}</span>)}
            </div>
            {isFarmer && (
              <p className="fh-hint">{t('You have {n} listings tagged {season}.', { n: mine.data?.length ?? 0, season: t(info.key) })}</p>
            )}
          </section>

          <section className="fh-card">
            <h3>{isFarmer ? t('Buyer demand for {season} crops', { season: t(info.key) }) : t('Live {season} produce', { season: t(info.key) })} ({available.length})</h3>
            {items.loading && <Loading />}
            <ErrorNote error={items.error} onRetry={items.reload} />
            {!items.loading && available.length === 0 && (
              <p className="fh-hint">{isFarmer ? t('No open buyer requests for this season yet.') : t('No live listings for this season yet.')}</p>
            )}
            {isFarmer
              ? available.map((r) => (
                <div className="fh-item" key={r.id}>
                  <span className="fh-emoji" aria-hidden="true">{emojiFor(r.category)}</span>
                  <div className="fh-item-main">
                    <strong>{r.product_name} — {r.quantity} {t(r.unit)}</strong>
                    <small>{r.buyer_name} · {r.district || r.state || '—'} · {timeLeft(r.expires_at, t)}</small>
                  </div>
                  <div className="fh-actions"><button onClick={() => onContact(r)}>{t('Contact')}</button></div>
                </div>
              ))
              : available.map((p) => (
                <div className="fh-item" key={p.id}>
                  {p.image_url
                    ? <img className="fh-thumb" src={imgSrc(p.image_url)} alt="" />
                    : <span className="fh-emoji" aria-hidden="true">{emojiFor(p.category)}</span>}
                  <div className="fh-item-main">
                    <strong>{p.name}</strong>
                    <small>{p.farmer_name} · {p.district || p.state} · {money(p.price)}/{t(p.unit)} · {t('{q} {u} left', { q: p.quantity, u: t(p.unit) })}</small>
                  </div>
                  <SeasonBadge season={p.season} />
                  <div className="fh-actions"><button onClick={() => onOrder(p)}>{t('Order')}</button></div>
                </div>
              ))}
          </section>
        </div>
      )}
    </div>
  )
}
