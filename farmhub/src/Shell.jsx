import { useT } from './i18n'
import { LanguageSwitcher } from './LangUI'

// Shared frame for the farmer and buyer apps: header + role-specific tabs.
export default function Shell({ user, tabs, active, onTab, onLogout, onLanguage, children }) {
  const t = useT()
  const isFarmer = user.role === 'farmer'
  return (
    <div className="fx-app">
      <header className="fx-header">
        <div className="fx-header-inner">
          <a href="#overview" className="logo fx-brand" onClick={(e) => { e.preventDefault(); onTab('overview') }}>
            <span className="fx-brand-name">Farm<span>Hub.</span></span>
            <span className="fx-brand-tag">Kisan ka daam, <em>kisan ke haath</em></span>
          </a>
          <span className={`fx-role-badge ${user.role}`}>{isFarmer ? `🌱 ${t('Farmer')}` : `🛒 ${t('Buyer')}`}</span>
          {!isFarmer && user.kyb_verified && <span className="fx-kyb-badge" title={user.business_type}>✔ {t('Verified business')}</span>}
          {!isFarmer && user.flagged_middleman && <span className="fx-flag-badge" title={user.flag_reason}>⚠ {t('Under review')}</span>}
          <div className="fx-user">
            <strong>{user.name}</strong>
            <small>{[user.district, user.state].filter(Boolean).join(', ') || t('Location not set')}</small>
          </div>
          <LanguageSwitcher onChange={onLanguage} compact />
          <button className="fx-logout" onClick={onLogout}>{t('Logout')}</button>
        </div>
        <nav className="fx-tabs" aria-label={isFarmer ? 'Farmer menu' : 'Buyer menu'}>
          {tabs.map((tb) => (
            <button key={tb.id} className={active === tb.id ? 'active' : ''}
              aria-current={active === tb.id ? 'page' : undefined} onClick={() => onTab(tb.id)}>
              <span aria-hidden="true">{tb.icon}</span> {t(tb.label)}
            </button>
          ))}
        </nav>
      </header>
      <main className="fx-main">{children}</main>
    </div>
  )
}
