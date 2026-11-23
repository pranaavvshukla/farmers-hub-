// Every Indian state / UT and its districts (from the map's own boundary data).
import INDIA from './data/india-districts.json'

export const STATES = Object.keys(INDIA).sort((a, b) => a.localeCompare(b))
const ALIASES = { kashmir: 'Jammu and Kashmir', 'j&k': 'Jammu and Kashmir', orissa: 'Odisha', 'new delhi': 'Delhi', up: 'Uttar Pradesh', mp: 'Madhya Pradesh', cg: 'Chhattisgarh' }

// "chhattisgarh", "CG" or "Kashmir" -> the official state name used by the map.
export function canonicalState(name) {
  const n = (name || '').trim().toLowerCase()
  if (!n) return ''
  return STATES.find((s) => s.toLowerCase() === n) || ALIASES[n] || ''
}
export const districtsOf = (state) => INDIA[canonicalState(state)] || []
