import { useEffect, useState } from 'react'
import { useT } from './i18n'

// App-wide extras: "you are offline" banner and an "Install FarmHub" prompt
// (Chrome / Edge on Android and desktop offer to add the app to the home screen).
export default function AppChrome() {
  const t = useT()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [installEvt, setInstallEvt] = useState(null)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('fh_install_dismissed') === '1' } catch { return false }
  })

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem('fh_install_dismissed', '1') } catch { /* ignore */ }
  }

  return (
    <>
      {!online && <div className="fx-offline" role="status">📶 {t('You are offline. Saved screens still open; changes need internet.')}</div>}
      {installEvt && !hidden && (
        <div className="fx-install" role="dialog" aria-label={t('Install FarmHub')}>
          <span>📲 {t('Install FarmHub on your phone')}</span>
          <button onClick={async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); setInstallEvt(null) }}>{t('Install')}</button>
          <button className="x" onClick={dismiss} aria-label={t('Close')}>×</button>
        </div>
      )}
    </>
  )
}
