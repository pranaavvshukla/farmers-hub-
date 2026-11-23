import { useCallback, useEffect, useState } from 'react'
import './App.css'
import './ui.css'
import './shell.css'
import './phase2.css'
import { api, clearSession, loadSession, saveSession } from './api'
import AuthModal from './AuthModal'
import BuyerApp from './BuyerApp'
import FarmerApp from './FarmerApp'
import { langForState, useLang } from './i18n'
import Landing from './Landing'

// One app, two separate experiences: a farmer only ever sees FarmerApp,
// a buyer only ever sees BuyerApp. Logged-out visitors see the landing page.
function App() {
  const [user, setUser] = useState(() => loadSession()?.user || null)
  const [auth, setAuth] = useState(null) // { mode: 'login' | 'register', role }
  const { setLang } = useLang()

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // Keep the stored session in sync when the profile changes (PIN code, KYB, language).
  const updateUser = useCallback((u) => {
    const s = loadSession()
    if (s) saveSession({ ...s, user: u })
    setUser(u)
  }, [])

  useEffect(() => {
    window.addEventListener('fh:session-expired', logout)
    return () => window.removeEventListener('fh:session-expired', logout)
  }, [logout])

  // Refresh the profile once per login (KYB / flag status may have changed on the server).
  const uid = user?.id
  useEffect(() => {
    if (!uid) return
    api('/api/auth/me').then(updateUser).catch(() => {})
  }, [uid, updateUser])

  function handleAuth(u) {
    setAuth(null)
    window.history.replaceState(null, '', `${window.location.pathname}#overview`)
    setLang(u.language || langForState(u.state))
    setUser(u)
  }

  const onLanguage = useCallback((code) => {
    if (!user) return
    api('/api/auth/me', { method: 'PATCH', body: { language: code } }).then(updateUser).catch(() => {})
  }, [user, updateUser])

  const props = { user, onLogout: logout, onUserUpdate: updateUser, onLanguage }
  if (user?.role === 'farmer') return <FarmerApp {...props} />
  if (user?.role === 'buyer') return <BuyerApp {...props} />

  return (
    <>
      <Landing onAuth={(mode, role) => setAuth({ mode, role })} />
      {auth && (
        <AuthModal
          key={`${auth.mode}-${auth.role}`}
          initialMode={auth.mode}
          initialRole={auth.role}
          onClose={() => setAuth(null)}
          onAuth={handleAuth}
        />
      )}
    </>
  )
}

export default App
