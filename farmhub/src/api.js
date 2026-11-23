import { useCallback, useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000'
const KEY = 'fh_session'

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}
export function saveSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session))
}
export function clearSession() {
  localStorage.removeItem(KEY)
}

// Returns the response's `data`; with { full: true } returns { message, data }.
export async function api(path, { method = 'GET', body, form, full = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  const session = loadSession()
  if (session?.token) headers.Authorization = `Bearer ${session.token}`

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    const err = new Error(
      'Backend se connect nahi ho paa raha. Flask server (port 5000) chalu hai?'
    )
    err.offline = true
    throw err
  }

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const err = new Error(json?.message || json?.msg || 'Something went wrong.')
    err.status = res.status
    err.jwt = Boolean(json?.msg) // flask-jwt-extended error (expired / invalid token)
    if (err.jwt) window.dispatchEvent(new Event('fh:session-expired'))
    throw err
  }
  return full ? { message: json.message, data: json.data } : json.data
}

// Load data for a screen; `refreshKey` changing (or reload()) fetches it again.
export function useApi(path, refreshKey = 0) {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const [own, setOwn] = useState(0)
  useEffect(() => {
    if (!path) return
    let alive = true
    api(path)
      .then((data) => alive && setState({ data, error: '', loading: false }))
      .catch((err) => alive && setState({ data: null, error: err.message, loading: false }))
    return () => {
      alive = false
    }
  }, [path, refreshKey, own])
  const reload = useCallback(() => setOwn((k) => k + 1), [])
  return { ...state, reload }
}

// The open tab lives in the URL hash (#finance), so links and refresh keep it.
export function useHashTab(ids, fallback) {
  const read = useCallback(() => {
    const h = window.location.hash.slice(1)
    return ids.includes(h) ? h : fallback
  }, [ids, fallback])
  const [tab, setTab] = useState(read)
  useEffect(() => {
    const onHash = () => setTab(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [read])
  const go = useCallback((id) => {
    if (window.location.hash.slice(1) !== id) window.location.hash = id
    setTab(id)
    window.scrollTo(0, 0)
  }, [])
  return [tab, go]
}

export const CATEGORIES = ['Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices', 'Dairy', 'Other']
export const UNITS = ['kg', 'quintal', 'ton', 'dozen', 'litre']
const EMOJI = { Vegetables: '🥕', Fruits: '🍎', Grains: '🌾', Pulses: '🫘', Spices: '🌶️', Dairy: '🥛' }
export const emojiFor = (category) => EMOJI[category] || '🌱'
export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

// Indian crop seasons (same rules as backend/seasons.py)
export const SEASON_LIST = ['Kharif', 'Rabi', 'Zaid', 'All year']
export const SEASON_HINT = {
  Kharif: 'Monsoon · Jun–Oct',
  Rabi: 'Winter · Nov–Feb',
  Zaid: 'Summer · Mar–May',
  'All year': 'Any time of year',
}
const SEASON_WORDS = [
  ['Zaid', ['watermelon', 'muskmelon', 'melon', 'cucumber', 'gourd', 'pumpkin', 'mango', 'fodder', 'litchi', 'moong']],
  ['Kharif', ['rice', 'paddy', 'maize', 'corn', 'cotton', 'soybean', 'soya', 'groundnut', 'bajra', 'jowar', 'tur', 'arhar', 'urad', 'sugarcane', 'okra', 'bhindi', 'apple']],
  ['Rabi', ['wheat', 'barley', 'gram', 'chana', 'mustard', 'peas', 'masoor', 'lentil', 'potato', 'onion', 'garlic', 'tomato', 'cauliflower', 'cabbage', 'carrot', 'spinach', 'radish', 'grape', 'orange']],
]
export function guessSeason(name) {
  const text = (name || '').toLowerCase()
  for (const [season, words] of SEASON_WORDS) {
    if (words.some((w) => new RegExp(`\\b${w}`).test(text))) return season
  }
  return 'All year'
}

// Product images may be relative (/api/images/3) -> point them at the backend.
export const imgSrc = (url) => (url && url.startsWith('/') ? BASE + url : url)

// Returns { url, quality } — quality is the automatic photo grade (or null).
export async function uploadImage(file) {
  const form = new FormData()
  form.append('file', file)
  return api('/api/upload', { method: 'POST', form })
}

// Backend dates are UTC without a "Z"; add it so the browser converts correctly.
const asDate = (iso) => new Date(iso.endsWith('Z') ? iso : iso + 'Z')

export const fmtDate = (iso) =>
  iso ? asDate(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// Pass the translator `t` from useT() to get Hindi / Marathi text.
export const timeLeft = (iso, t = (s, v) => (v ? s.replace('{n}', v.n) : s)) => {
  if (!iso) return t('Flexible timing')
  const days = Math.ceil((asDate(iso) - Date.now()) / 86400000)
  if (days <= 0) return t('Expires today')
  return days === 1 ? t('Needed within 1 day') : t('Needed within {n} days', { n: days })
}
