import { useId, useMemo, useRef, useState } from 'react'
import { useT } from './i18n'
import { canonicalState, districtsOf, STATES } from './india'


// Text box + dropdown list: click ▾ to browse, or type to search. Keyboard: ↑ ↓ Enter Esc.
export default function Combobox({ value, onChange, options, placeholder, label, allowCustom = true, required, disabled, id }) {
  const t = useT()
  const autoId = useId()
  const inputId = id || autoId
  const listId = `${inputId}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(null) // null = showing the selected value
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const text = query ?? value ?? ''
  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return options
    const starts = options.filter((o) => o.toLowerCase().startsWith(q))
    const contains = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q))
    return [...starts, ...contains]
  }, [options, query])

  function pick(opt) {
    onChange(opt)
    setQuery(null)
    setOpen(false)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); pick(filtered[active]) }
    else if (e.key === 'Escape') { setOpen(false); setQuery(null) }
  }

  function onBlur() {
    // Typed text that exactly matches an option (any case) snaps to it.
    if (query != null) {
      const exact = options.find((o) => o.toLowerCase() === query.trim().toLowerCase())
      if (exact) onChange(exact)
      else if (allowCustom) onChange(query.trim())
      setQuery(null)
    }
    setOpen(false)
  }

  return (
    <div className={`fx-combo ${open ? 'open' : ''}`}>
      {label && <label htmlFor={inputId} className="fx-combo-label">{label}</label>}
      <div className="fx-combo-box">
        <input ref={inputRef} id={inputId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          value={text} placeholder={placeholder} required={required} disabled={disabled} autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)} onBlur={onBlur} onKeyDown={onKey} />
        <button type="button" tabIndex={-1} className="fx-combo-toggle" aria-label={t('Show list')} disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current?.focus() }}>▾</button>
      </div>
      {open && !disabled && (
        <ul id={listId} role="listbox" className="fx-combo-list">
          {filtered.length === 0 && <li className="fx-combo-empty">{allowCustom ? t('No match — your text will be used') : t('No match')}</li>}
          {filtered.slice(0, 300).map((o, i) => (
            <li key={o} role="option" aria-selected={o === value} className={`${i === active ? 'active' : ''} ${o === value ? 'selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o) }} onMouseEnter={() => setActive(i)}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// State + district pair: the district list follows the chosen state.
export function StateDistrictPicker({ state, district, onChange, required }) {
  const t = useT()
  const districts = districtsOf(state)
  return (
    <div className="fh-row">
      <Combobox label={t('State')} value={state} options={STATES} placeholder={t('Type or pick a state')} required={required}
        onChange={(s) => {
          const canon = canonicalState(s) || s
          onChange({ state: canon, district: districtsOf(canon).includes(district) ? district : '' })
        }} />
      <Combobox label={t('District')} value={district} options={districts} required={required}
        placeholder={districts.length ? t('Type or pick a district') : t('Pick a state first')}
        onChange={(d) => onChange({ state, district: d })} />
    </div>
  )
}
