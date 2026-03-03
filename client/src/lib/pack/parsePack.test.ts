import { describe, it, expect } from 'vitest'
import { normalizeText, parsePackFromText, computeUnitCost } from './parsePack'

describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeText('  Hello   WORLD  ')).toBe('hello world')
  })

  it('replaces × and ✕ with x', () => {
    expect(normalizeText('24 × 12 oz')).toBe('24 x 12 oz')
    expect(normalizeText('6✕330ml')).toBe('6x330ml')
  })
})

describe('parsePackFromText', () => {
  it('parses "Strawberry 24 x 12 oz Bottle" as CASE', () => {
    const result = parsePackFromText('Strawberry 24 x 12 oz Bottle')
    expect(result.packType).toBe('CASE')
    expect(result.unitsPerCase).toBe(24)
    expect(result.unitDescriptor).toContain('12 oz')
    expect(result.priceBasis).toBe('PER_CASE')
  })

  it('parses "Coke 6x330ml cans" as CASE', () => {
    const result = parsePackFromText('Coke 6x330ml cans')
    expect(result.packType).toBe('CASE')
    expect(result.unitsPerCase).toBe(6)
    expect(result.unitDescriptor).toContain('330ml')
  })

  it('parses "Strawberry 12gr" as UNIT', () => {
    const result = parsePackFromText('Strawberry 12gr')
    expect(result.packType).toBe('UNIT')
    expect(result.unitsPerCase).toBe(1)
    expect(result.unitDescriptor).toMatch(/12\s*gr/)
  })

  it('parses "Rice 5kg" as UNIT', () => {
    const result = parsePackFromText('Rice 5kg')
    expect(result.packType).toBe('UNIT')
    expect(result.unitsPerCase).toBe(1)
    expect(result.unitDescriptor).toContain('5kg')
  })

  it('parses "Water 12 × 500ml" (multiplication sign) as CASE', () => {
    const result = parsePackFromText('Water 12 × 500ml')
    expect(result.packType).toBe('CASE')
    expect(result.unitsPerCase).toBe(12)
    expect(result.unitDescriptor).toContain('500ml')
  })

  it('parses loose pattern "Beer 24 x bottles" as CASE', () => {
    const result = parsePackFromText('Beer 24 x bottles')
    expect(result.packType).toBe('CASE')
    expect(result.unitsPerCase).toBe(24)
    expect(result.unitDescriptor).toBe('bottles')
  })

  it('parses plain product "Banana" as UNIT with empty descriptor', () => {
    const result = parsePackFromText('Banana')
    expect(result.packType).toBe('UNIT')
    expect(result.unitsPerCase).toBe(1)
    expect(result.unitDescriptor).toBe('')
  })

  it('treats "1 x 500ml" as UNIT (count = 1)', () => {
    const result = parsePackFromText('Juice 1 x 500ml')
    expect(result.packType).toBe('UNIT')
    expect(result.unitsPerCase).toBe(1)
  })

  it('always sets parseVersion = 1', () => {
    expect(parsePackFromText('anything').parseVersion).toBe(1)
  })
})

describe('computeUnitCost', () => {
  it('divides by unitsPerCase for PER_CASE pricing', () => {
    expect(computeUnitCost(48, 'CASE', 24, 'PER_CASE')).toBe(2)
  })

  it('returns price as-is for PER_UNIT pricing', () => {
    expect(computeUnitCost(5.99, 'UNIT', 1, 'PER_UNIT')).toBe(5.99)
  })

  it('returns price as-is for CASE + PER_UNIT (already per unit)', () => {
    expect(computeUnitCost(2, 'CASE', 24, 'PER_UNIT')).toBe(2)
  })

  it('handles unitsPerCase = 0 gracefully', () => {
    expect(computeUnitCost(48, 'CASE', 0, 'PER_CASE')).toBe(48)
  })
})
