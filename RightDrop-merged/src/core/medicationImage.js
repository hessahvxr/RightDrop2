// Which picture may be shown next to a medication.
//
// Rule: a product picture is shown only when the prescription can be matched,
// WITHOUT GUESSING, to exactly one verified entry of the picture catalogue
// (src/data/medicationImages.js). In every other case the caller shows the
// same neutral eye-drop picture for all medications.
//
// A prescription matches an entry only when ALL of these hold:
//   1. the entry is complete and verified (source, link, date, picture);
//   2. the entry is an eye-drop product (dosage form);
//   3. the prescription's medication name is exactly one of the entry's TRADE
//      names (whole name, not a part of it);
//   4. the prescription's concentration is exactly the entry's strength;
//   5. no other entry with a different picture matches as well.
//
// A scientific (generic) name is deliberately NOT enough: the same substance is
// sold by several companies in different packs, so choosing one pack for it
// would be a guess, and a patient could take the picture for their own bottle.
//
// Nothing here reads or writes the database: the picture follows the
// prescription's name and concentration, so it changes by itself when the
// prescription changes.

// Dosage forms accepted as "eye drops". Anything else (ointment, gel, tablet,
// ear drops...) is never shown next to an eye-drop reminder.
export const EYE_DROP_FORMS = ['eye drops', 'ophthalmic solution', 'ophthalmic suspension', 'ophthalmic emulsion']

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

function latinDigits(text) {
  return String(text ?? '')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٫،]/g, '.')
    .replace(/٪/g, '%')
}

// 'Xalatan®  ' -> 'xalatan'. Letters and digits only, single spaces.
export function normalizeMedicationName(text) {
  return latinDigits(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // Arabic vowel marks and tatweel
    .replace(/[®™©]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// One strength as a number of milligrams per millilitre (or per gram).
// '0.5%' and '5 mg/ml' are the same strength written two ways (1% = 10 mg/ml).
function parseOneStrength(part) {
  const m = /^(\d+(?:\.\d+)?)\s*(%|mg\s*\/\s*ml|mg\s*\/\s*g|mcg\s*\/\s*ml|µg\s*\/\s*ml|ug\s*\/\s*ml)$/.exec(part.trim())
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = m[2].replace(/\s+/g, '')
  if (unit === '%') return value * 10
  if (unit === 'mg/ml' || unit === 'mg/g') return value
  return value / 1000 // micrograms
}

// '0.5%' -> [5];  '2% + 0.5%' -> [5, 20];  anything unclear -> null.
// A list, because combination products carry one strength per substance.
export function parseStrength(text) {
  const clean = latinDigits(text).toLowerCase().trim()
  if (!clean) return null
  const parts = clean.split(/\s*(?:\+|,|;|&| and | و )\s*|\s+\/\s+/)
  const values = []
  for (const part of parts) {
    const value = parseOneStrength(part)
    if (value === null) return null
    values.push(Math.round(value * 1e6) / 1e6)
  }
  return values.sort((a, b) => a - b)
}

function sameStrength(a, b) {
  return !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
}

// An entry may be used only when everything needed to trust it is present.
export function isUsableImageEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const names = Array.isArray(entry.tradeNames) ? entry.tradeNames.map(normalizeMedicationName).filter(Boolean) : []
  return (
    names.length > 0 &&
    !!parseStrength(entry.strength) &&
    EYE_DROP_FORMS.includes(String(entry.dosageForm || '').toLowerCase().trim()) &&
    typeof entry.image === 'string' && entry.image.trim() !== '' &&
    typeof entry.source === 'string' && entry.source.trim() !== '' &&
    /^https:\/\//i.test(String(entry.sourceUrl || '')) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(entry.verifiedOn || ''))
  )
}

// The verified catalogue entry for this prescription, or null.
// `prescription` needs `medication_name` and `concentration`, as stored.
export function findVerifiedMedicationImage(prescription, catalogue) {
  const name = normalizeMedicationName(prescription?.medication_name)
  const strength = parseStrength(prescription?.concentration)
  if (!name || !strength || !Array.isArray(catalogue)) return null

  const matches = catalogue.filter((entry) =>
    isUsableImageEntry(entry) &&
    entry.tradeNames.some((n) => normalizeMedicationName(n) === name) &&
    sameStrength(parseStrength(entry.strength), strength)
  )
  if (matches.length === 0) return null
  // Two different pictures for the same name and strength: not certain, so none.
  if (new Set(matches.map((m) => m.image.trim())).size !== 1) return null
  return matches[0]
}
