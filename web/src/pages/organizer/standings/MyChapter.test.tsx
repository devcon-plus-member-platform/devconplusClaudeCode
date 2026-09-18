import { describe, expect, it } from 'vitest'
import source from './MyChapter.tsx?raw'

describe('MyChapter data-loading effect', () => {
  it('re-runs when chapterId arrives late (after async auth hydration)', () => {
    // chapterId restores asynchronously via Firebase onAuthStateChanged, so the
    // effect must depend on it — with [] a hard refresh fires once at null and
    // the My Chapter tab stays on "not linked to a chapter" forever.
    expect(source).toMatch(/}\s*,\s*\[chapterId\]\)/)
  })
})

describe('MyChapter participation-rate rendering', () => {
  it('gates the percentage on the value, not the row status', () => {
    // computeChapterStanding returns participationRate: null with status
    // 'unranked' when nobody is eligible — gating on status renders a bare "%".
    expect(source).toContain('row.participationRate !== null')
    expect(source).not.toContain("row.status !== 'no-events' && (")
  })
})
