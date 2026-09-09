export type ChapterNameConflict =
  | { kind: 'duplicate'; existing: { id: string; name: string } }
  | { kind: 'inactive-variant'; existing: { id: string; name: string } }

/** Whitespace only — never strip `*` (inactive-chapter marker) or change casing. */
export function normalizeChapterName(input: string): string {
  return input.trim()
}

export function findChapterNameConflict(
  input: string,
  chapters: { id: string; name: string }[],
  excludeId?: string,
): ChapterNameConflict | null {
  const name = normalizeChapterName(input)
  if (!name) return null

  for (const chapter of chapters) {
    if (chapter.id === excludeId) continue
    if (chapter.name.toLowerCase() === name.toLowerCase()) {
      return { kind: 'duplicate', existing: chapter }
    }
    if (chapter.name.toLowerCase() === `${name.toLowerCase()}*`) {
      return { kind: 'inactive-variant', existing: chapter }
    }
  }

  return null
}

export function pageForIndex(index: number, pageSize: number): number {
  if (index < 0 || pageSize <= 0) return 1
  return Math.floor(index / pageSize) + 1
}
