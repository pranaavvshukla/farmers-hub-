// Language provider, switcher and the brand tagline.
import { useCallback, useMemo, useState } from 'react'
import { DICTS, initialLang, LANG_KEY, LangContext, LANGS, useLang } from './i18n'

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)
  const setLang = useCallback((code) => {
    if (!DICTS[code]) return
    setLangState(code)
    try { localStorage.setItem(LANG_KEY, code) } catch { /* ignore */ }
    document.documentElement.lang = code
  }, [])
  const t = useCallback((text, vars) => {
    let out = DICTS[lang]?.[text] ?? text
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v)
    return out
  }, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function LanguageSwitcher({ onChange, compact }) {
  const { lang, setLang } = useLang()
  return (
    <label className={`fx-lang fx-lang-select ${compact ? 'compact' : ''}`} title="Language / भाषा">
      <span aria-hidden="true">🌐</span>
      <select value={lang} aria-label="Language / भाषा" lang={lang}
        onChange={(e) => { setLang(e.target.value); onChange?.(e.target.value) }}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  )
}

// Brand tagline. The Hinglish line is the brand; the Devanagari line sits under it.
export function Tagline({ size = 'hero' }) {
  return (
    <span className={`fh-tagline fh-tagline-${size}`}>
      <span className="fh-tagline-latin">
        <span className="tl-a">Kisan ka daam,</span>
        <span className="tl-b">kisan ke haath.</span>
      </span>
      <span className="fh-tagline-deva" lang="hi">किसान का दाम, किसान के हाथ</span>
    </span>
  )
}
