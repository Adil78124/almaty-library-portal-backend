import { BranchType } from "@prisma/client"
import { z } from "zod"

import {
  localizedTitleSchema,
  optionalLocalizedDescriptionSchema,
  optionalLocalizedTitleSchema,
  scrubText,
} from "../lib/content-sanitize.js"

const optionalUrl = z
  .union([
    z.string().url(),
    z.string().regex(/^\/uploads\/[^?#]+$/),
    z.literal(""),
  ])
  .optional()
  .nullable()

const optionalEmail = z
  .union([z.string().email(), z.literal("")])
  .optional()
  .nullable()

const branchDescriptionRuSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null) return ""
    return scrubText(String(v))
  })
  .refine(
    (s) =>
      s === undefined ||
      s.length === 0 ||
      (s.length >= 3 && /[\p{L}\p{N}]/u.test(s)),
    "Описание (RU): минимум 3 символа или оставьте пустым"
  )

export const branchCreateSchema = z.object({
  titleRu: localizedTitleSchema,
  titleKz: optionalLocalizedTitleSchema,
  type: z.nativeEnum(BranchType),
  published: z.boolean().optional(),
  isMainBranch: z.boolean().optional(),
  subtitle: z.string().max(500).optional().nullable(),
  subtitleKz: z.string().max(500).optional().nullable(),
  cityLabel: z.string().max(200).optional().nullable(),
  cityLabelKz: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  addressKz: z.string().max(500).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  email: optionalEmail,
  hours: z.string().max(2000).optional().nullable(),
  descriptionRu: branchDescriptionRuSchema,
  descriptionKz: optionalLocalizedDescriptionSchema,
  cardImageUrl: optionalUrl,
  heroImageUrl: optionalUrl,
  /// JSON-массив ссылок: [{ "label": "YouTube", "url": "https://..." }, ...]
  socialLinksJson: z.string().max(20000).nullable().optional(),
})

export const branchUpdateSchema = branchCreateSchema.partial()

/** Контакты, тексты и внешний вид карточки/шапки (для ADMIN своего филиала и SUPER). */
export const branchContactsPatchSchema = z
  .object({
    titleRu: localizedTitleSchema.optional(),
    titleKz: optionalLocalizedTitleSchema.optional(),
    subtitle: z.string().max(500).nullable().optional(),
    subtitleKz: z.string().max(500).nullable().optional(),
    cityLabel: z.string().max(200).nullable().optional(),
    cityLabelKz: z.string().max(200).nullable().optional(),
    cardImageUrl: optionalUrl,
    heroImageUrl: optionalUrl,
    address: z.string().max(500).nullable().optional(),
    addressKz: z.string().max(500).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    email: optionalEmail,
    hours: z.string().max(2000).nullable().optional(),
    descriptionRu: branchDescriptionRuSchema,
    descriptionKz: optionalLocalizedDescriptionSchema.optional(),
    socialLinksJson: z.string().max(20000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Укажите хотя бы одно поле",
  })
