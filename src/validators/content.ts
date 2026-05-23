import { z } from "zod"

import {
  localizedDescriptionSchema,
  localizedTitleSchema,
  optionalLocalizedDescriptionSchema,
  optionalLocalizedTitleSchema,
  scrubText,
} from "../lib/content-sanitize.js"
import { normalizeSocialIconStored } from "../lib/social-icon-normalize.js"
import { workingHoursSchema } from "../lib/working-hours.js"

export const publishStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"])

export const siteSettingsPutSchema = z.object({
  orgNameShort: z.string().min(1),
  orgNameLong: z.string().min(1),
  orgNameShortKz: z.string().nullable().optional(),
  orgNameLongKz: z.string().nullable().optional(),
  footerTagline: z.string().nullable().optional(),
  footerTaglineKz: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  addressKz: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phoneSecondary: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  sanitaryDayRu: z.string().nullable().optional(),
  sanitaryDayKz: z.string().nullable().optional(),
  workingHours: workingHoursSchema.nullable().optional(),
  copyrightLine: z.string().nullable().optional(),
  copyrightLineKz: z.string().nullable().optional(),
  privacyUrl: z.string().nullable().optional(),
  termsUrl: z.string().nullable().optional(),
  socialLinksJson: z.string().nullable().optional(),
  homeNewsLimit: z.number().int().min(1).max(20).optional(),
  homeNewsAutoRefresh: z.boolean().optional(),
  homeNewsPollSeconds: z.number().int().min(10).max(3600).nullable().optional(),
  homeEventsLimit: z.number().int().min(1).max(20).optional(),
  homeEventsAutoRefresh: z.boolean().optional(),
  homeEventsPollSeconds: z.number().int().min(10).max(3600).nullable().optional(),
})

/** Частичное обновление настроек главной: новости и афиша (только админ). */
export const siteSettingsNewsHomePatchSchema = z.object({
  homeNewsLimit: z.number().int().min(1).max(20).optional(),
  homeNewsAutoRefresh: z.boolean().optional(),
  homeNewsPollSeconds: z.number().int().min(10).max(3600).nullable().optional(),
  homeEventsLimit: z.number().int().min(1).max(20).optional(),
  homeEventsAutoRefresh: z.boolean().optional(),
  homeEventsPollSeconds: z.number().int().min(10).max(3600).nullable().optional(),
})

export const homeHeroPutSchema = z.object({
  backgroundImageUrl: z.string().nullable().optional(),
  titleLine1: z.string().min(1),
  titleLine2: z.string().min(1),
  quoteText: z.string().min(1),
  quoteAuthor: z.string().min(1),
})

export const marqueeCreateSchema = z.object({
  text: z.string().min(1),
  sortOrder: z.number().int().optional(),
})

export const marqueeUpdateSchema = marqueeCreateSchema.partial()

export const homeMetricCreateSchema = z.object({
  iconName: z.string().min(1),
  valueText: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
  linkUrl: z.string().nullable().optional(),
})

export const homeMetricUpdateSchema = homeMetricCreateSchema.partial()

export const navItemCreateSchema = z.object({
  labelRu: z.string().min(1),
  labelKz: z.string().nullable().optional(),
  href: z.string().min(1),
  sortOrder: z.number().int().optional(),
  visible: z.boolean().optional(),
})

export const navItemUpdateSchema = navItemCreateSchema.partial()

const newsSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (s) => !/[/#?]/.test(s),
    "Slug не может содержать символы / ? #"
  )

export const newsCreateSchema = z.object({
  slug: newsSlugSchema,
  titleRu: localizedTitleSchema,
  titleKz: optionalLocalizedTitleSchema,
  descriptionRu: localizedDescriptionSchema,
  descriptionKz: optionalLocalizedDescriptionSchema,
  coverImageUrl: z.string().nullable().optional(),
  publishedAt: z.string().optional().nullable(),
  location: z.string().max(500).nullable().optional(),
  locationKz: z.string().max(500).nullable().optional(),
  curator: z.string().max(500).nullable().optional(),
  curatorKz: z.string().max(500).nullable().optional(),
  status: publishStatusSchema.optional(),
  sortOrder: z.number().int().optional(),
  /** Только SUPER_ADMIN; для ADMIN игнорируется на сервере. */
  branchId: z.string().min(1).nullable().optional(),
})

export const newsUpdateSchema = newsCreateSchema
  .partial()
  .extend({
    slug: newsSlugSchema.optional(),
  })

export const eventCreateSchema = z.object({
  slug: z.string().min(1),
  titleRu: localizedTitleSchema,
  titleKz: optionalLocalizedTitleSchema,
  descriptionRu: localizedDescriptionSchema,
  descriptionKz: optionalLocalizedDescriptionSchema,
  posterUrl: z.string().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  timeDisplay: z.string().nullable().optional(),
  timeDisplayKz: z.string().nullable().optional(),
  format: z.string().max(200).nullable().optional(),
  formatKz: z.string().max(200).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  categoryKz: z.string().max(200).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  locationKz: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaLabelKz: z.string().nullable().optional(),
  ctaHref: z.string().nullable().optional(),
  featuredOnHome: z.boolean().optional(),
  status: publishStatusSchema.optional(),
  sortOrder: z.number().int().optional(),
  /** Только SUPER_ADMIN; для ADMIN игнорируется на сервере. */
  branchId: z.string().min(1).nullable().optional(),
})

export const eventUpdateSchema = eventCreateSchema.partial().omit({ slug: true })

const optionalBookDescriptionRu = z
  .string()
  .max(50_000)
  .optional()
  .transform((v) => scrubText(v ?? ""))
  .refine((s) => s.length === 0 || (s.length >= 3 && /[\p{L}\p{N}]/u.test(s)), {
    message: "Описание (RU): минимум 3 символа или оставьте пустым",
  })

const optionalBookDescriptionKz = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null ? null : scrubText(v)))
  .refine(
    (s) => s == null || s.length === 0 || (s.length >= 3 && /[\p{L}\p{N}]/u.test(s)),
    { message: "Описание (KZ): минимум 3 символа или пусто" }
  )

export const digitalItemCreateSchema = z.object({
  titleRu: localizedTitleSchema,
  titleKz: optionalLocalizedTitleSchema,
  descriptionRu: optionalBookDescriptionRu,
  descriptionKz: optionalBookDescriptionKz,
  author: z.string().min(1).max(500).transform(scrubText),
  authorKz: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? null : scrubText(v))),
  coverUrl: z.string().nullable().optional(),
  resourceUrl: z.string().nullable().optional(),
  showOnHome: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export const digitalItemUpdateSchema = digitalItemCreateSchema.partial()

export const newArrivalCreateSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  coverUrl: z.string().nullable().optional(),
  detailUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const newArrivalUpdateSchema = newArrivalCreateSchema.partial()

export const localHistoryCreateSchema = z.object({
  name: z.string().min(1),
  excerpt: z.string().min(1),
  portraitUrl: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const localHistoryUpdateSchema = localHistoryCreateSchema.partial()

export const galleryItemCreateSchema = z.object({
  slot: z.number().int().min(0).max(4),
  imageUrl: z.string().min(1),
  caption: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const galleryItemUpdateSchema = galleryItemCreateSchema.partial().omit({
  slot: true,
})

export const partnerLinkCreateSchema = z.object({
  title: z.string().min(1),
  titleKz: z.string().max(300).nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  href: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export const partnerLinkUpdateSchema = partnerLinkCreateSchema.partial()

export const socialLinkCreateSchema = z
  .object({
    label: z.string().min(1),
    labelKz: z.string().max(200).nullable().optional(),
    icon: z.union([z.string(), z.null(), z.undefined()]).optional(),
    logoUrl: z.string().nullable().optional(),
    url: z.string().url(),
    sortOrder: z.number().int().optional(),
  })
  .transform((d) => ({
    ...d,
    icon: normalizeSocialIconStored(d.icon),
  }))

export const socialLinkUpdateSchema = z
  .object({
    label: z.string().min(1).optional(),
    labelKz: z.string().max(200).nullable().optional(),
    icon: z.union([z.string(), z.null()]).optional(),
    logoUrl: z.string().nullable().optional(),
    url: z.string().url().optional(),
    sortOrder: z.number().int().optional(),
  })
  .transform((d) => ({
    ...d,
    ...(d.icon !== undefined ? { icon: normalizeSocialIconStored(d.icon) } : {}),
  }))

export const mediaAssetCreateSchema = z.object({
  url: z.string().min(1),
  filename: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
})
