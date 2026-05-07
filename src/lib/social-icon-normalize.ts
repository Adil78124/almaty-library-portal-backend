/** Нормализация ключа иконки для БД и API (латиница, цифры, - _). */
export function normalizeSocialIconStored(s: unknown): string {
  if (s == null) return "link"
  const t = String(s).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
  if (t === "") return "link"
  return t.slice(0, 64)
}
