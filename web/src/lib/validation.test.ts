import { describe, expect, it } from 'vitest'
import { isValidUUID, UUID_RE } from './validation'

describe('isValidUUID', () => {
  it('accepts valid v4 UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidUUID('6ba7b810-9dad-41d2-80b4-00c04fd430c8')).toBe(true)
  })

  it('rejects invalid formats', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false)
    expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false)
    expect(isValidUUID('')).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isValidUUID(null)).toBe(false)
    expect(isValidUUID(undefined)).toBe(false)
  })
})

describe('UUID_RE', () => {
  it('is case insensitive', () => {
    expect(UUID_RE.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })
})
