/** Escapes a single CSV field, quoting it if it contains a comma, quote, or newline. */
function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Builds a CSV file from an array of plain objects (column order follows the keys of the
 * first row) and triggers a browser download via a Blob + temporary <a> link.
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvField(row[header])).join(',')),
  ]
  const csvContent = lines.join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
