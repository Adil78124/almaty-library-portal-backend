export function normalizeKzPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null

  // Keep only digits, but preserve leading + if any.
  const hasPlus = t.startsWith("+")
  const digits = t.replace(/[^\d]/g, "")
  if (!digits) return null

  // Common Kazakhstan formats:
  // - 8XXXXXXXXXX (11 digits, starts with 8) -> +7XXXXXXXXXX
  // - 7XXXXXXXXXX (11 digits, starts with 7) -> +7XXXXXXXXXX
  // - +7XXXXXXXXXX (already ok) -> +7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`
  }
  if (hasPlus && digits.length >= 10) {
    return `+${digits}`
  }

  // Fallback: return digits with + if it looks like intl.
  if (digits.length >= 10) return hasPlus ? `+${digits}` : digits
  return digits
}

