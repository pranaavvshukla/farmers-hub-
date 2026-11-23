import { useEffect, useRef, useState } from 'react'
import { LANGS, useLang } from './i18n'
import { parseListing, speechSupported } from './voice'

// "Speak to fill": the farmer says "20 quintal onion 1800 rupees" in Hindi, Marathi
// or English and the Add Produce form fills itself. Uses the browser's own free
// Web Speech API; a type-in box does the same where speech is not available.
export default function VoiceFill({ onFill }) {
  const { lang, t } = useLang()
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState('')
  const recRef = useRef(null)
  const supported = speechSupported()

  useEffect(() => () => recRef.current?.abort(), [])

  function apply(text) {
    const fields = parseListing(text)
    setHeard(text)
    const got = Object.keys(fields)
    if (!got.length) {
      setNote(t('Could not understand. Try: "20 quintal onion 1800 rupees".'))
      return
    }
    onFill(fields)
    setNote(t('Filled: {fields}', {
      fields: [fields.name, fields.quantity != null && `${fields.quantity} ${fields.unit || ''}`, fields.price != null && `₹${fields.price}`]
        .filter(Boolean).join(' · '),
    }))
  }

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = LANGS.find((l) => l.code === lang)?.speech || 'en-IN'
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setHeard(text)
      if (e.results[e.results.length - 1].isFinal) apply(text)
    }
    rec.onerror = (e) => {
      setNote(e.error === 'not-allowed' ? t('Microphone permission was blocked. Allow it in the browser, or type below.') : t('Could not hear clearly. Please try again.'))
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setNote('')
    setHeard('')
    setListening(true)
    rec.start()
  }

  return (
    <div className="fx-voice">
      <div className="fx-voice-row">
        <button type="button" className={`fx-mic ${listening ? 'on' : ''}`} disabled={!supported}
          onClick={() => (listening ? recRef.current?.stop() : start())}
          aria-label={listening ? t('Stop listening') : t('Speak to fill')}>
          <span aria-hidden="true">{listening ? '◼' : '🎙️'}</span>
        </button>
        <div className="fx-voice-text">
          <strong>{listening ? t('Listening… speak now') : t('Speak to fill')}</strong>
          <small>{supported ? t('Say: "20 quintal onion 1800 rupees" — in Hindi, Marathi or English') : t('Voice works in Chrome and Edge. You can type the sentence instead.')}</small>
        </div>
      </div>
      <div className="fx-voice-type">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('or type: 20 quintal kanda 1800 rupaye')}
          aria-label={t('Type a sentence to fill the form')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (typed.trim()) apply(typed) } }} />
        <button type="button" onClick={() => typed.trim() && apply(typed)}>{t('Fill')}</button>
      </div>
      {heard && <p className="fx-voice-heard">“{heard}”</p>}
      {note && <p className="fx-voice-note" role="status">{note}</p>}
    </div>
  )
}
