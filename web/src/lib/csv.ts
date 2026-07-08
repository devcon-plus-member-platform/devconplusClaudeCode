// CSV export helpers shared by organizer registrant views (EventRegistrants, EventSummary).

const escapeCsvValue = (value: string | number | boolean | null | undefined) => {
  const raw = value === null || value === undefined ? '' : String(value)
  const escaped = raw.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export const buildCsv = (
  headers: string[],
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
) => {
  const headerLine = headers.join(',')
  const lines = rows.map((row) => headers.map((key) => escapeCsvValue(row[key])).join(','))
  return [headerLine, ...lines].join('\n')
}

export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const getPhilippineDateStamp = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
