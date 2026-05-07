import { z } from "zod"

/** Удаляет невидимые символы и обрезает пробелы. */
export function scrubText(s: string): string {
  return s
    .replace(/\u200b/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
}

/** Заголовок: минимум 3 значимых символа (буквы/цифры), без «мусора» из одних спецсимволов. */
export const localizedTitleSchema = z
  .string()
  .max(500)
  .transform(scrubText)
  .refine((s) => s.length >= 3, "Минимум 3 символа")
  .refine(
    (s) => /[\p{L}\p{N}]/u.test(s),
    "Заголовок должен содержать буквы или цифры"
  )

/** Пусто / null → null; поле не передано → undefined (для PATCH). */
export const optionalLocalizedTitleSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null) return null
    const t = scrubText(String(v))
    return t === "" ? null : t
  })
  .refine(
    (s) =>
      s === undefined ||
      s == null ||
      (s.length >= 3 && /[\p{L}\p{N}]/u.test(s)),
    "KZ: минимум 3 символа или оставьте пустым"
  )

export const localizedDescriptionSchema = z
  .string()
  .max(100_000)
  .transform(scrubText)
  .refine((s) => s.length >= 3, "Описание: минимум 3 символа")
  .refine(
    (s) => /[\p{L}\p{N}]/u.test(s),
    "Описание должно содержать буквы или цифры"
  )

export const optionalLocalizedDescriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null) return null
    const t = scrubText(String(v))
    return t === "" ? null : t
  })
  .refine(
    (s) =>
      s === undefined ||
      s == null ||
      (s.length >= 3 && /[\p{L}\p{N}]/u.test(s)),
    "KZ: минимум 3 символа или пусто"
  )
