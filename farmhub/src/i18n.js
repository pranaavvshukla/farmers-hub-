// Tiny i18n layer (no library needed): t('English text') returns the translation in the
// chosen Indian language when one exists, else the English text. Placeholders: t('Hi {name}', { name }).
import { createContext, useContext } from 'react'
import hi from './i18n/hi'
import mr from './i18n/mr'
import bn from './i18n/bn'
import te from './i18n/te'
import ta from './i18n/ta'

export const LANGS = [
  { code: 'en', short: 'EN', label: 'English', speech: 'en-IN' },
  { code: 'hi', short: 'हिं', label: 'हिंदी', speech: 'hi-IN' },
  { code: 'mr', short: 'मरा', label: 'मराठी', speech: 'mr-IN' },
  { code: 'bn', short: 'বাং', label: 'বাংলা', speech: 'bn-IN' },
  { code: 'te', short: 'తె', label: 'తెలుగు', speech: 'te-IN' },
  { code: 'ta', short: 'த', label: 'தமிழ்', speech: 'ta-IN' },
]
export const DICTS = { en: {}, hi, mr, bn, te, ta }
export const LANG_KEY = 'fh_lang'

// The language of the state the user signed up from (falls back to English).
const STATE_LANG = {
  maharashtra: 'mr', goa: 'mr',
  'uttar pradesh': 'hi', 'madhya pradesh': 'hi', bihar: 'hi', rajasthan: 'hi', haryana: 'hi',
  delhi: 'hi', 'new delhi': 'hi', chhattisgarh: 'hi', jharkhand: 'hi', uttarakhand: 'hi',
  'himachal pradesh': 'hi', chandigarh: 'hi',
  'west bengal': 'bn', tripura: 'bn',
  telangana: 'te', 'andhra pradesh': 'te',
  'tamil nadu': 'ta', puducherry: 'ta',
}
export const langForState = (state) => STATE_LANG[(state || '').trim().toLowerCase()] || 'en'

export function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (DICTS[saved]) return saved
  } catch { /* storage blocked */ }
  return 'en'
}

export const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (s) => s })

export const useLang = () => useContext(LangContext)
export const useT = () => useContext(LangContext).t
