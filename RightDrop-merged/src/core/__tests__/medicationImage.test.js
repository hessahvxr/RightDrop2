// Which picture may be shown next to a medication. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findVerifiedMedicationImage, isUsableImageEntry, normalizeMedicationName, parseStrength, EYE_DROP_FORMS,
} from '../index.js'
import { MEDICATION_IMAGES } from '../../data/medicationImages.js'

// Entries made up for these tests. They are not real products or real pictures.
const entry = (over = {}) => ({
  tradeNames: ['Testdrop', 'تست دروب'],
  scientificName: 'testolol',
  strength: '0.5%',
  dosageForm: 'eye drops',
  image: '/medication-images/testdrop-0.5.webp',
  source: 'Test source',
  sourceUrl: 'https://example.test/testdrop',
  verifiedOn: '2026-11-14',
  ...over,
})
const rx = (medication_name, concentration) => ({ medication_name, concentration })
const find = (name, strength, catalogue = [entry()]) => findVerifiedMedicationImage(rx(name, strength), catalogue)

test('the catalogue shipped with the app is empty, so every medication gets the neutral picture', () => {
  assert.deepEqual(MEDICATION_IMAGES, [])
  assert.equal(findVerifiedMedicationImage(rx('Timolol', '0.5%'), MEDICATION_IMAGES), null)
  assert.equal(findVerifiedMedicationImage(rx('Xalatan', '0.005%'), MEDICATION_IMAGES), null)
})

test('exact trade name + exact strength: the entry is found, however the name is typed', () => {
  assert.equal(find('Testdrop', '0.5%').image, '/medication-images/testdrop-0.5.webp')
  assert.ok(find('  TESTDROP® ', '0.5 %'))
  assert.ok(find('تست دروب', '٠٫٥٪'), 'Arabic spelling and Arabic digits')
  assert.ok(find('Testdrop', '5 mg/ml'), '0.5% and 5 mg/ml are the same strength')
  assert.ok(find('Testdrop', '5mg/mL'))
})

test('a different strength never matches', () => {
  assert.equal(find('Testdrop', '0.25%'), null)
  assert.equal(find('Testdrop', '5%'), null)
  assert.equal(find('Testdrop', '0.05%'), null)
})

test('a missing or unreadable concentration never matches', () => {
  for (const c of [null, undefined, '', '  ', 'نصف', 'half', '0.5', '0.5 drops', '-0.5%', '0%']) {
    assert.equal(find('Testdrop', c), null, String(c))
  }
})

test('the name must be the whole trade name: no partial, longer or similar names', () => {
  for (const name of ['Test', 'Testdrop Plus', 'Testdrops', 'Testdrop 0.5%', 'Testdr0p', 'drop', '', null]) {
    assert.equal(find(name, '0.5%'), null, String(name))
  }
})

test('a scientific (generic) name is not enough: several companies sell it in different packs', () => {
  assert.equal(find('testolol', '0.5%'), null)
  assert.equal(find('Testolol', '0.5%', [entry(), entry({ tradeNames: ['Otherdrop'], image: '/medication-images/other.webp' })]), null)
})

test('only eye-drop forms are accepted', () => {
  for (const form of EYE_DROP_FORMS) assert.ok(find('Testdrop', '0.5%', [entry({ dosageForm: form })]), form)
  for (const form of ['eye ointment', 'ear drops', 'tablet', 'gel', '', undefined]) {
    assert.equal(find('Testdrop', '0.5%', [entry({ dosageForm: form })]), null, String(form))
  }
})

test('an entry without its proof (source, https link, date, picture) is ignored', () => {
  for (const over of [{ source: '' }, { sourceUrl: '' }, { sourceUrl: 'http://example.test/x' }, { verifiedOn: '' }, { verifiedOn: 'last week' }, { image: '' }, { tradeNames: [] }, { strength: 'strong' }]) {
    assert.equal(isUsableImageEntry(entry(over)), false, JSON.stringify(over))
    assert.equal(find('Testdrop', '0.5%', [entry(over)]), null)
  }
  assert.equal(isUsableImageEntry(entry()), true)
  assert.equal(isUsableImageEntry(null), false)
})

test('two different pictures for the same name and strength: not certain, so none', () => {
  assert.equal(find('Testdrop', '0.5%', [entry(), entry({ image: '/medication-images/another.webp' })]), null)
  assert.ok(find('Testdrop', '0.5%', [entry(), entry()]), 'the same picture listed twice is still one picture')
})

test('each strength of a product has its own picture', () => {
  const catalogue = [entry(), entry({ strength: '0.25%', image: '/medication-images/testdrop-0.25.webp' })]
  assert.equal(find('Testdrop', '0.5%', catalogue).image, '/medication-images/testdrop-0.5.webp')
  assert.equal(find('Testdrop', '0.25%', catalogue).image, '/medication-images/testdrop-0.25.webp')
})

test('combination products: every strength must match, in any order', () => {
  const combo = [entry({ tradeNames: ['Testcombo'], strength: '2% + 0.5%' })]
  assert.ok(find('Testcombo', '2% + 0.5%', combo))
  assert.ok(find('Testcombo', '0.5% + 2%', combo))
  assert.ok(find('Testcombo', '20 mg/ml + 5 mg/ml', combo))
  assert.equal(find('Testcombo', '2%', combo), null)
  assert.equal(find('Testcombo', '2% + 0.25%', combo), null)
})

test('the picture follows the prescription: changing the name or strength changes the result', () => {
  const catalogue = [entry(), entry({ tradeNames: ['Otherdrop'], strength: '1%', image: '/medication-images/other-1.webp' })]
  assert.equal(findVerifiedMedicationImage(rx('Testdrop', '0.5%'), catalogue).image, '/medication-images/testdrop-0.5.webp')
  assert.equal(findVerifiedMedicationImage(rx('Otherdrop', '1%'), catalogue).image, '/medication-images/other-1.webp')
  assert.equal(findVerifiedMedicationImage(rx('Otherdrop', '0.5%'), catalogue), null)
})

test('bad input never throws', () => {
  assert.equal(findVerifiedMedicationImage(null, [entry()]), null)
  assert.equal(findVerifiedMedicationImage(rx('Testdrop', '0.5%'), null), null)
  assert.equal(findVerifiedMedicationImage(rx('Testdrop', '0.5%'), [null, 'x', 5, {}]), null)
  assert.equal(normalizeMedicationName(null), '')
  assert.equal(parseStrength(undefined), null)
})
