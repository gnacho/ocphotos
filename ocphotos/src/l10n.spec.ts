import { describe, expect, it } from 'vitest'
import translations from '../l10n/translations.json'

type Forms = string | string[]
type Blocks = Record<string, Record<string, Forms>>

const REFERENCE = 'es'
const PLACEHOLDER = /%\{\w+\}/g
const LANGUAGE_TAG = /^[a-z]{2}(-[A-Z]{2})?$/

const forms = (value: Forms): string[] => (Array.isArray(value) ? value : [value])

const placeholders = (value: string) => (value.match(PLACEHOLDER) ?? []).sort()

// one line per defect, so a failing run says what is wrong instead of only
// reporting that the file does not match
const checkTranslations = (blocks: Blocks, reference = REFERENCE): string[] => {
  const problems: string[] = []
  const referenceBlock = blocks[reference]

  if (!referenceBlock) return [`${reference}: reference block is missing`]

  const referenceKeys = Object.keys(referenceBlock).sort()

  for (const [locale, block] of Object.entries(blocks)) {
    if (!LANGUAGE_TAG.test(locale)) {
      problems.push(`${locale}: not a well-formed language tag`)
      continue
    }

    for (const [key, value] of Object.entries(block)) {
      const translated = forms(value)

      if (translated.length === 0 || translated.some((form) => form.trim() === '')) {
        problems.push(`${locale}: "${key}" has an empty value`)
        continue
      }

      if (locale === reference || !(key in referenceBlock)) continue

      const expected = placeholders(referenceBlock[key] as string)

      for (const form of translated) {
        const actual = placeholders(form)

        if (expected.join() !== actual.join()) {
          problems.push(
            `${locale}: "${key}" placeholders [${actual.join(' ')}] do not match [${expected.join(' ')}]`
          )
          break
        }
      }
    }

    if (locale === reference) continue

    const missing = referenceKeys.filter((key) => !(key in block))
    const extra = Object.keys(block)
      .filter((key) => !(key in referenceBlock))
      .sort()

    if (missing.length > 0) problems.push(`${locale}: missing keys ${missing.join(', ')}`)
    if (extra.length > 0) problems.push(`${locale}: keys not in ${reference} ${extra.join(', ')}`)
  }

  return problems
}

describe('checkTranslations', () => {
  const reference = { Add: 'Añadir', '%{n} items': '%{n} elementos' }

  it('accepts a block that matches the reference', () => {
    const blocks = { es: reference, de: { Add: 'Hinzufügen', '%{n} items': '%{n} Elemente' } }

    expect(checkTranslations(blocks)).toEqual([])
  })

  it('accepts gettext plural forms when every form keeps the placeholder', () => {
    const blocks = {
      es: reference,
      de: { Add: 'Hinzufügen', '%{n} items': ['%{n} Element', '%{n} Elemente'] }
    }

    expect(checkTranslations(blocks)).toEqual([])
  })

  it('reports missing keys', () => {
    const blocks = { es: reference, de: { Add: 'Hinzufügen' } }

    expect(checkTranslations(blocks)).toEqual(['de: missing keys %{n} items'])
  })

  it('reports keys the reference does not have', () => {
    const blocks = { es: reference, de: { ...reference, Remove: 'Entfernen' } }

    expect(checkTranslations(blocks)).toEqual(['de: keys not in es Remove'])
  })

  it('reports a dropped placeholder', () => {
    const blocks = { es: reference, de: { Add: 'Hinzufügen', '%{n} items': 'Elemente' } }

    expect(checkTranslations(blocks)).toEqual([
      'de: "%{n} items" placeholders [] do not match [%{n}]'
    ])
  })

  it('reports a renamed placeholder', () => {
    const blocks = { es: reference, de: { Add: 'Hinzufügen', '%{n} items': '%{count} Elemente' } }

    expect(checkTranslations(blocks)).toEqual([
      'de: "%{n} items" placeholders [%{count}] do not match [%{n}]'
    ])
  })

  it('reports an empty value', () => {
    const blocks = { es: reference, de: { Add: '   ', '%{n} items': '%{n} Elemente' } }

    expect(checkTranslations(blocks)).toEqual(['de: "Add" has an empty value'])
  })

  it('reports a malformed language tag', () => {
    const blocks = { es: reference, german: { Add: 'Hinzufügen', '%{n} items': '%{n} Elemente' } }

    expect(checkTranslations(blocks)).toEqual(['german: not a well-formed language tag'])
  })

  it('reports a missing reference block', () => {
    expect(checkTranslations({ de: { Add: 'Hinzufügen' } })).toEqual([
      'es: reference block is missing'
    ])
  })
})

describe('l10n/translations.json', () => {
  it('keeps every language block complete and consistent', () => {
    expect(checkTranslations(translations as unknown as Blocks)).toEqual([])
  })
})
