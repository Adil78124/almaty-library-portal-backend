export function parsePublishedAtInput(
  value: string | null | undefined
): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const s = String(value).trim()
  if (s === "") return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
