import { useT } from './i18n'
import { LanguageSwitcher, Tagline } from './LangUI'

// Public landing page: the visitor first picks "Farmer" or "Buyer",
// then gets an account (and later a dashboard) made only for that role.
const ROLES = [
  {
    role: 'farmer',
    icon: '🌱',
    title: "I'm a Farmer",
    sub: 'Sell your harvest directly and see exactly what reaches your bank.',
    features: [
      'List produce by voice, or type it, in your own language',
      'Live mandi rate and MSP next to your price',
      'Pool with village neighbours for truckload buyers',
      'Escrow: 70% paid at pickup, the rest on delivery',
      'Finance dashboard: net payout and gross profit by month, quarter and year',
    ],
  },
  {
    role: 'buyer',
    icon: '🛒',
    title: "I'm a Buyer",
    sub: 'Buy fresh produce straight from farms at transparent prices.',
    features: [
      'Order directly from farmers or village bulk pools',
      'Photo-graded produce: Grade A / B with freshness score',
      'Mandi price reference on every listing',
      'Your money is safe in escrow until delivery',
      'Verified business badge (GSTIN + FSSAI)',
    ],
  },
]

const PILLARS = [
  ['🛡️', 'No middlemen', 'GSTIN checksum + FSSAI checks for buyers, and automatic flags for aggregator behaviour.'],
  ['📊', 'Fair price anchor', 'District mandi rate and government MSP next to every price.'],
  ['🤝', 'Village pools', 'Neighbours with the same crop and PIN code sell one truckload together.'],
  ['🔒', 'Milestone escrow', 'Buyer pays first. 70% released at pickup, 30% on delivery OTP.'],
  ['🔍', 'Photo quality check', 'Every crop photo gets a Grade A / B badge and a freshness score.'],
  ['🎙️', 'Speak your language', '6 Indian languages, with voice listing for farmers.'],
]

export default function Landing({ onAuth }) {
  const t = useT()
  return (
    <div className="app">
      <div className="announcement">{t("Connecting India's Farmers & Buyers — Directly.")}</div>

      <nav className="navbar">
        <a href="#top" className="logo">Farm<span>Hub.</span></a>
        <div className="nav-links">
          <a href="#roles">{t('For farmers')}</a>
          <a href="#roles">{t('For buyers')}</a>
          <a href="#why">{t('Why FarmHub')}</a>
        </div>
        <div className="nav-auth">
          <LanguageSwitcher compact />
          <button className="ghost" onClick={() => onAuth('login', 'farmer')}>{t('Farmer login')}</button>
          <button className="ghost" onClick={() => onAuth('login', 'buyer')}>{t('Buyer login')}</button>
        </div>
      </nav>

      <header className="hero fh-hero2" id="top">
        <div className="hero-content">
          <span className="hero-tag">{t('DIRECT FARM-TO-BUYER TRADE')}</span>
          <h1 className="fh-hero-h1"><Tagline /></h1>
          <p>
            {t('Farmers set their own price and see the mandi rate beside it. Buyers pay into escrow and get graded produce straight from the village — no commission agent in between.')}
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => onAuth('register', 'farmer')}>🌱 {t("I'm a Farmer")} →</button>
            <button className="secondary-btn" onClick={() => onAuth('register', 'buyer')}>🛒 {t("I'm a Buyer")}</button>
          </div>
          <div className="hero-trust">
            <span>🔒 {t('Escrow-protected')}</span>
            <span>📊 {t('Mandi & MSP linked')}</span>
            <span>🇮🇳 {t('6 Indian languages')}</span>
          </div>
        </div>
        <div className="hero-visual">
          <img src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=85" alt={t('Green agricultural fields')} />
          <div className="hero-floating-card">
            <span>🌾</span>
            <div>
              <strong>{t('Sale ₹1,500 → Bank ₹1,300')}</strong>
              <small>{t('Every deduction shown, nothing hidden')}</small>
            </div>
          </div>
        </div>
      </header>

      <section className="lp-pillars" id="why">
        <div className="section-heading">
          <span className="section-kicker">{t('WHY FARMHUB')}</span>
          <h2>{t('Built to keep the middleman out')}</h2>
        </div>
        <div className="lp-pillar-grid">
          {PILLARS.map(([icon, title, sub]) => (
            <article key={title} className="lp-pillar">
              <span aria-hidden="true">{icon}</span>
              <h3>{t(title)}</h3>
              <p>{t(sub)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-roles-section" id="roles">
        <div className="section-heading">
          <span className="section-kicker">{t('CHOOSE YOUR ACCOUNT')}</span>
          <h2>{t('Who are you?')}</h2>
          <p>{t('Each account gets its own dashboard with only the tools it needs.')}</p>
        </div>
        <div className="lp-roles">
          {ROLES.map((r) => (
            <article key={r.role} className={`lp-role lp-role-${r.role}`}>
              <div className="lp-role-head">
                <span className="lp-role-icon" aria-hidden="true">{r.icon}</span>
                <div>
                  <h3>{t(r.title)}</h3>
                  <p>{t(r.sub)}</p>
                </div>
              </div>
              <ul>
                {r.features.map((f) => <li key={f}>{t(f)}</li>)}
              </ul>
              <div className="lp-role-actions">
                <button className="fh-submit" onClick={() => onAuth('register', r.role)}>
                  {r.role === 'farmer' ? t('Create farmer account') : t('Create buyer account')}
                </button>
                <button className="lp-link" onClick={() => onAuth('login', r.role)}>
                  {r.role === 'farmer' ? t('I already have a farmer account') : t('I already have a buyer account')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-how" id="how">
        <div className="section-heading">
          <span className="section-kicker">{t('HOW IT WORKS')}</span>
          <h2>{t('Three steps to trade directly')}</h2>
        </div>
        <ol className="lp-steps">
          <li><strong>{t('Pick your role and sign up')}</strong><span>{t('Farmer or buyer, with your district and PIN code.')}</span></li>
          <li><strong>{t('List or request')}</strong><span>{t('Farmers list produce (even by voice), buyers order or post what they need.')}</span></li>
          <li><strong>{t('Pay safely, deliver, get paid')}</strong><span>{t('Escrow releases 70% at pickup and 30% on delivery.')}</span></li>
        </ol>
      </section>

      <footer className="fh-footer2">
        <a href="#top" className="logo">Farm<span>Hub.</span></a>
        <Tagline size="footer" />
        <small>© 2026 FarmHub · Team Code Pirates · Hack-a-Sol 5.0</small>
      </footer>
    </div>
  )
}
