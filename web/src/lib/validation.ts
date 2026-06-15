/** Validates that a string is a valid UUID v4 format */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isValidUUID(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
