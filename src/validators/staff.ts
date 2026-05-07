import { z } from "zod"

import { scrubText } from "../lib/content-sanitize.js"
import { normalizeKzPhone } from "../lib/phone-normalize.js"

function scrubName(v: unknown): string {
  return scrubText(String(v ?? ""))
}

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null) return null
    const t = scrubText(String(v)).trim()
    return t === "" ? null : t
  })

const optionalPhone = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null) return null
    return normalizeKzPhone(String(v))
  })

export const staffCreateSchema = z.object({
  slug: z.string().min(3).max(200),
  fullNameRu: z.string().min(3).max(200).transform(scrubName),
  fullNameKz: optionalText,
  birthDate: z
    .union([z.string(), z.date(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === undefined) return undefined
      if (v == null || v === "") return null
      if (v instanceof Date) return v
      // Expect DD.MM.YYYY or ISO
      const s = String(v).trim()
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s)
      if (m) {
        const dd = Number(m[1])
        const mm = Number(m[2])
        const yyyy = Number(m[3])
        const d = new Date(Date.UTC(yyyy, mm - 1, dd))
        if (Number.isNaN(d.getTime())) return null
        return d
      }
      const d = new Date(s)
      if (Number.isNaN(d.getTime())) return null
      return d
    }),
  phone: optionalPhone,
  positionRu: optionalText,
  positionKz: optionalText,
  branchRu: z.string().min(2).max(200).transform(scrubText),
  branchKz: optionalText,
  imageUrl: optionalText,
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
})

export const staffUpdateSchema = staffCreateSchema
  .omit({ slug: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Укажите хотя бы одно поле" })

