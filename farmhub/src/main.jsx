import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppChrome from './AppChrome'
import { LangProvider } from './LangUI'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <App />
      <AppChrome />
    </LangProvider>
  </StrictMode>,
)

// Offline-ready app shell. Only in the production build, so `npm run dev` never serves stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
