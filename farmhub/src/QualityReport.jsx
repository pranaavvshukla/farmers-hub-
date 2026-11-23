import { useT } from './i18n'
import { QualityBadge } from './Widgets'

const CHECK_LABEL = {
  resolution: 'Resolution', sharpness: 'Sharpness', colour_vibrancy: 'Colour vibrancy',
  dark_spots: 'Dark spots', exposure: 'Lighting',
}

// Result of the automatic photo check shown right after the farmer uploads a photo.
export default function QualityReport({ report }) {
  const t = useT()
  if (!report) return null
  return (
    <div className={`fx-qreport ${report.grade === 'Grade A' ? 'a' : 'b'}`}>
      <div className="fx-qreport-head">
        <strong>🔍 {t('AI quality check')}</strong>
        <QualityBadge grade={report.grade} freshness={report.freshness} />
      </div>
      <p>{t(report.label)}. {t('Buyers see this badge on your listing.')}</p>
      <ul>
        {Object.entries(report.checks).map(([k, c]) => (
          <li key={k} className={c.level}><span>{t(CHECK_LABEL[k] || k)}</span><b>{c.value}</b></li>
        ))}
      </ul>
      {report.grade !== 'Grade A' && <small>{t('Tip: take the photo in daylight, close up, and keep the camera steady for Grade A.')}</small>}
    </div>
  )
}
