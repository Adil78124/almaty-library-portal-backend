import type { Request } from "express"

export type ApiLang = "ru" | "kz"

export function parseApiLang(req: Request): ApiLang {
  const raw = req.query.lang
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (v === "kz" || v === "kk") return "kz"
  return "ru"
}

/** Выбор строки для ответа публичного API. */
export function pickApiLang(
  lang: ApiLang,
  ru: string | null | undefined,
  kz: string | null | undefined
): string {
  const r = (ru ?? "").trim()
  const k = (kz ?? "").trim()
  if (lang === "kz" && k) return k
  return r || k
}
