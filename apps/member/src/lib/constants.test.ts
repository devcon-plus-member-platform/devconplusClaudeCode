import { describe, expect, it } from 'vitest'
import { EVENT_XP, DEFAULT_EVENT_XP, ROLE_DISPLAY_NAMES, WORK_TYPE_LABELS } from './constants'

describe('EVENT_XP', () => {
  it('defines XP for all event categories', () => {
    expect(EVENT_XP.tech_talk).toBe(5)
    expect(EVENT_XP.workshop).toBe(150)
    expect(EVENT_XP.hackathon).toBe(150)
    expect(EVENT_XP.summit).toBe(500)
  })

  it('default XP is 5', () => {
    expect(DEFAULT_EVENT_XP).toBe(5)
  })
})

describe('ROLE_DISPLAY_NAMES', () => {
  it('maps all four roles', () => {
    expect(Object.keys(ROLE_DISPLAY_NAMES)).toHaveLength(4)
    expect(ROLE_DISPLAY_NAMES.member).toBe('Member')
    expect(ROLE_DISPLAY_NAMES.super_admin).toBe('Super Admin')
  })
})

describe('WORK_TYPE_LABELS', () => {
  it('maps all work types', () => {
    expect(WORK_TYPE_LABELS.remote).toBe('Remote')
    expect(WORK_TYPE_LABELS.hybrid).toBe('Hybrid')
  })
})
