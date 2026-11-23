// Turns a spoken sentence like "20 quintal onion 1800 rupees" or
// "बीस क्विंटल प्याज अठारह सौ रुपये" or "२० क्विंटल कांदा १८०० रुपये" into form fields.

// Same crops as backend/crops.py: [display name, category, words in English / Hindi / Marathi]
export const CROP_WORDS = [
  ['Onion', 'Vegetables', ['onion', 'pyaz', 'pyaaz', 'kanda', 'प्याज', 'प्याज़', 'कांदा', 'कांदे']],
  ['Tomato', 'Vegetables', ['tomato', 'tamatar', 'टमाटर', 'टोमॅटो', 'टोमाटो']],
  ['Potato', 'Vegetables', ['potato', 'aloo', 'batata', 'आलू', 'बटाटा', 'बटाटे']],
  ['Wheat', 'Grains', ['wheat', 'gehu', 'gehun', 'गेहूं', 'गेहूँ', 'गहू']],
  ['Rice', 'Grains', ['rice', 'paddy', 'chawal', 'चावल', 'धान', 'तांदूळ', 'भात']],
  ['Orange', 'Fruits', ['orange', 'santra', 'संतरा', 'संत्रा', 'संत्री']],
  ['Cotton', 'Other', ['cotton', 'kapas', 'कपास', 'कापूस']],
  ['Soybean', 'Pulses', ['soybean', 'soyabean', 'soya', 'सोयाबीन']],
  ['Grapes', 'Fruits', ['grape', 'angoor', 'अंगूर', 'द्राक्ष', 'द्राक्षे']],
  ['Apple', 'Fruits', ['apple', 'seb', 'सेब', 'सफरचंद']],
  ['Watermelon', 'Fruits', ['watermelon', 'tarbooz', 'तरबूज', 'तरबूज़', 'कलिंगड']],
  ['Green Chilli', 'Spices', ['chilli', 'chili', 'mirchi', 'मिर्च', 'मिरची']],
  ['Garlic', 'Spices', ['garlic', 'lahsun', 'लहसुन', 'लसूण']],
  ['Chana (Gram)', 'Pulses', ['chana', 'gram', 'चना', 'हरभरा']],
  ['Tur (Arhar)', 'Pulses', ['tur', 'arhar', 'toor', 'तूर', 'अरहर']],
  ['Maize', 'Grains', ['maize', 'corn', 'makka', 'मक्का', 'मका']],
  ['Banana', 'Fruits', ['banana', 'kela', 'केला', 'केळी']],
  ['Pomegranate', 'Fruits', ['pomegranate', 'anar', 'अनार', 'डाळिंब']],
  ['Cauliflower', 'Vegetables', ['cauliflower', 'gobi', 'फूलगोभी', 'गोभी', 'फ्लॉवर']],
  ['Brinjal', 'Vegetables', ['brinjal', 'baingan', 'बैंगन', 'वांगी', 'वांगे']],
]

const UNIT_WORDS = [
  ['quintal', ['quintal', 'quintals', 'kwintal', 'क्विंटल', 'क्वींटल', 'कुंटल', 'क्विंटल']],
  ['ton', ['ton', 'tons', 'tonne', 'टन']],
  ['kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'किलो', 'किलोग्राम', 'केजी']],
  ['dozen', ['dozen', 'दर्जन', 'डझन']],
  ['litre', ['litre', 'liter', 'लीटर', 'लिटर']],
]
const RUPEE_WORDS = ['rupees', 'rupee', 'rupaye', 'rs', '₹', 'रुपये', 'रुपए', 'रुपया', 'रूपये', 'रुपयांना', 'रुपयाला', 'रु']
const PRICE_WORDS = ['price', 'rate', 'bhav', 'भाव', 'दर', 'दाम', 'किंमत', 'कीमत']

// Number words that speech recognition sometimes returns instead of digits.
const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
  'पंद्रह': 15, 'पच्चीस': 25, 'अठारह': 18, 'सौ': 100, 'हजार': 1000, 'हज़ार': 1000,
  'दोन': 2, 'पाच': 5, 'सहा': 6, 'नऊ': 9, 'वीस': 20, 'पन्नास': 50, 'शंभर': 100, 'हजारं': 1000,
}
const MULTIPLIERS = new Set([100, 1000])

const DEVANAGARI_DIGITS = '०१२३४५६७८९'

function tokenize(text) {
  const latinDigits = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
  return latinDigits
    .toLowerCase()
    .replace(/₹\s*/g, ' ₹ ')
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/(\d)\s*(kg|kgs|rs)\b/g, '$1 $2')
    .split(/[\s,.;:!?/-]+/)
    .filter(Boolean)
}

const matchWord = (tok, words) => words.some((w) => tok === w || (w.length > 3 && tok.startsWith(w)))

// Collapse number words ("अठारह सौ" -> 1800, "two thousand" -> 2000) into numeric tokens.
function numbers(tokens) {
  const out = []
  let acc = null
  const flush = () => { if (acc != null) { out.push({ n: acc }); acc = null } }
  for (const tok of tokens) {
    const digit = /^\d+(\.\d+)?$/.test(tok) ? Number(tok) : null
    const word = NUM_WORDS[tok]
    if (digit != null) { flush(); acc = digit; continue }
    if (word != null) {
      if (MULTIPLIERS.has(word)) acc = (acc ?? 1) * word
      else if (acc != null && acc >= 100 && word < 100) acc += word
      else { flush(); acc = word }
      continue
    }
    flush()
    out.push({ w: tok })
  }
  flush()
  return out
}

export function parseListing(text) {
  const items = numbers(tokenize(text || ''))
  const result = {}
  const words = items.filter((i) => i.w).map((i) => i.w)

  for (const [name, category, list] of CROP_WORDS) {
    if (words.some((w) => matchWord(w, list))) { result.name = name; result.category = category; break }
  }

  const loose = []
  items.forEach((it, i) => {
    if (it.n == null) return
    const next = items[i + 1]?.w
    const prev = items[i - 1]?.w
    const unit = next && UNIT_WORDS.find(([, ws]) => matchWord(next, ws))
    if (unit && result.quantity == null) { result.quantity = it.n; result.unit = unit[0]; return }
    if ((next && RUPEE_WORDS.includes(next)) || (prev && (RUPEE_WORDS.includes(prev) || PRICE_WORDS.includes(prev)))) {
      result.price = it.n
      return
    }
    loose.push(it.n)
  })
  for (const n of loose) {
    if (result.quantity == null) result.quantity = n
    else if (result.price == null) result.price = n
  }
  if (!result.unit && words.some((w) => UNIT_WORDS.some(([, ws]) => matchWord(w, ws)))) {
    result.unit = UNIT_WORDS.find(([, ws]) => words.some((w) => matchWord(w, ws)))[0]
  }
  return result
}

export const speechSupported = () =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
