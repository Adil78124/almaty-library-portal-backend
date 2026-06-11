import type { Prisma } from "@prisma/client"
import type { Request, Response } from "express"
import { z } from "zod"

import { checkBranchAccess } from "../lib/branch-access.js"
import { getOptionalAdmin } from "../lib/auth.js"
import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"
import { normalizeSocialIconStored } from "../lib/social-icon-normalize.js"
import {
  branchContactsPatchSchema,
  branchCreateSchema,
  branchUpdateSchema,
} from "../validators/branches.js"

function strOrNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === "" ? null : t
}

/** Пустая строка → null; иначе нормализованный JSON-массив { label, url, icon? }[]. */
function parseBranchSocialLinksInput(
  raw: string | null | undefined
): string | null {
  if (raw === undefined || raw === null) return null
  const t = raw.trim()
  if (t === "") return null
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    throw new Error("INVALID_SOCIAL_JSON")
  }
  if (!Array.isArray(parsed)) {
    throw new Error("INVALID_SOCIAL_JSON")
  }
  const normalized: {
    label: string
    labelKz?: string
    url: string
    icon?: string
  }[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      throw new Error("INVALID_SOCIAL_JSON")
    }
    const o = item as Record<string, unknown>
    if (typeof o.label !== "string" || typeof o.url !== "string") {
      throw new Error("INVALID_SOCIAL_JSON")
    }
    const label = o.label.trim()
    const labelKz =
      typeof o.labelKz === "string" && o.labelKz.trim()
        ? o.labelKz.trim()
        : undefined
    const url = o.url.trim()
    if (!label || !url) {
      continue
    }
    try {
      // eslint-disable-next-line no-new
      new URL(url)
    } catch {
      throw new Error("INVALID_SOCIAL_URL")
    }
    let iconOut: string | undefined
    if (o.icon !== undefined && o.icon !== null) {
      if (typeof o.icon !== "string") {
        throw new Error("INVALID_SOCIAL_JSON")
      }
      const ic = normalizeSocialIconStored(o.icon)
      if (ic !== "link") iconOut = ic
    }
    const row: {
      label: string
      labelKz?: string
      url: string
      icon?: string
    } = { label, url }
    if (labelKz) row.labelKz = labelKz
    if (iconOut) row.icon = iconOut
    normalized.push(row)
  }
  if (normalized.length === 0) return null
  return JSON.stringify(normalized)
}

export async function branchesList(req: Request, res: Response) {
  const isPublic = req.query.public === "1" || req.query.public === "true"
  const admin = await getOptionalAdmin(req)
  if (!admin) {
    if (!isPublic) return jsonError(res, "Требуется вход", 401)
    const rows = await prisma.branch.findMany({
      where: { published: true, type: { not: "REGIONAL" } },
      orderBy: [{ isMainBranch: "desc" }, { titleRu: "asc" }],
    })
    return res.json(rows)
  }
  if (admin.role === "SUPER_ADMIN") {
    const rows = await prisma.branch.findMany({ orderBy: { titleRu: "asc" } })
    return res.json(rows)
  }
  if (admin.role === "ADMIN" && admin.branchId) {
    const row = await prisma.branch.findUnique({ where: { id: admin.branchId } })
    return res.json(row ? [row] : [])
  }
  return res.json([])
}

export async function branchesGetById(req: Request, res: Response) {
  const isPublic = req.query.public === "1" || req.query.public === "true"
  const admin = await getOptionalAdmin(req)
  const { id } = req.params
  if (!admin) {
    if (!isPublic) return jsonError(res, "Требуется вход", 401)
    const row = await prisma.branch.findUnique({ where: { id } })
    if (!row || !row.published) return jsonError(res, "Не найдено", 404)
    return res.json(row)
  }
  try {
    checkBranchAccess(admin, id)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }
  const row = await prisma.branch.findUnique({ where: { id } })
  if (!row) {
    return jsonError(res, "Не найдено", 404)
  }
  return res.json(row)
}

export async function branchesCreate(req: Request, res: Response) {
  const parsed = branchCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const d = parsed.data
  let socialLinksJson: string | null | undefined
  if (d.socialLinksJson !== undefined) {
    try {
      socialLinksJson = parseBranchSocialLinksInput(d.socialLinksJson)
    } catch (e) {
      const code = e instanceof Error ? e.message : ""
      if (code === "INVALID_SOCIAL_URL") {
        return jsonError(res, "В socialLinksJson указан некорректный URL", 400)
      }
      return jsonError(
        res,
        "Соцсети: ожидается массив объектов с полями label и url (опционально icon)",
        400
      )
    }
  }
  try {
    const row = await prisma.branch.create({
      data: {
        titleRu: d.titleRu,
        titleKz: d.titleKz ?? null,
        type: d.type,
        published: d.published ?? true,
        isMainBranch: d.isMainBranch ?? false,
        subtitle: strOrNull(d.subtitle ?? undefined),
        subtitleKz: strOrNull(d.subtitleKz ?? undefined),
        cityLabel: strOrNull(d.cityLabel ?? undefined),
        cityLabelKz: strOrNull(d.cityLabelKz ?? undefined),
        address: strOrNull(d.address ?? undefined),
        addressKz: strOrNull(d.addressKz ?? undefined),
        phone: strOrNull(d.phone ?? undefined),
        email: strOrNull(d.email ?? undefined),
        hours: strOrNull(d.hours ?? undefined),
        descriptionRu: d.descriptionRu ?? "",
        descriptionKz: d.descriptionKz ?? null,
        cardImageUrl: strOrNull(d.cardImageUrl ?? undefined),
        heroImageUrl: strOrNull(d.heroImageUrl ?? undefined),
        ...(socialLinksJson !== undefined ? { socialLinksJson } : {}),
      },
    })
    return res.status(201).json(row)
  } catch (e) {
    console.error("[POST /branches]", e)
    return jsonError(res, "Не удалось создать филиал", 500)
  }
}

export async function branchesUpdate(req: Request, res: Response) {
  const { id } = req.params
  const parsed = branchUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  const d = parsed.data
  const data: Prisma.BranchUpdateInput = {}
  if (d.titleRu !== undefined) data.titleRu = d.titleRu
  if (d.titleKz !== undefined) data.titleKz = d.titleKz
  if (d.type !== undefined) data.type = d.type
  if (d.published !== undefined) data.published = d.published
  if (d.isMainBranch !== undefined) data.isMainBranch = d.isMainBranch
  if (d.subtitle !== undefined) data.subtitle = strOrNull(d.subtitle)
  if (d.subtitleKz !== undefined) data.subtitleKz = strOrNull(d.subtitleKz)
  if (d.cityLabel !== undefined) data.cityLabel = strOrNull(d.cityLabel)
  if (d.cityLabelKz !== undefined) data.cityLabelKz = strOrNull(d.cityLabelKz)
  if (d.address !== undefined) data.address = strOrNull(d.address)
  if (d.addressKz !== undefined) data.addressKz = strOrNull(d.addressKz)
  if (d.phone !== undefined) data.phone = strOrNull(d.phone)
  if (d.email !== undefined) data.email = strOrNull(d.email)
  if (d.hours !== undefined) data.hours = strOrNull(d.hours)
  if (d.descriptionRu !== undefined) data.descriptionRu = d.descriptionRu ?? ""
  if (d.descriptionKz !== undefined) data.descriptionKz = d.descriptionKz
  if (d.cardImageUrl !== undefined) data.cardImageUrl = strOrNull(d.cardImageUrl)
  if (d.heroImageUrl !== undefined) data.heroImageUrl = strOrNull(d.heroImageUrl)
  if (d.socialLinksJson !== undefined) {
    try {
      data.socialLinksJson = parseBranchSocialLinksInput(d.socialLinksJson)
    } catch (e) {
      const code = e instanceof Error ? e.message : ""
      if (code === "INVALID_SOCIAL_URL") {
        return jsonError(res, "В socialLinksJson указан некорректный URL", 400)
      }
      return jsonError(
        res,
        "Соцсети: ожидается массив объектов с полями label и url (опционально icon)",
        400
      )
    }
  }
  if (Object.keys(data).length === 0) {
    return jsonError(res, "Нет полей для обновления", 400)
  }
  try {
    const row = await prisma.branch.update({ where: { id }, data })
    return res.json(row)
  } catch (e) {
    console.error("[PATCH /branches/:id]", e)
    return jsonError(res, "Не удалось сохранить", 500)
  }
}

export async function branchesPatchContacts(req: Request, res: Response) {
  const admin = await getOptionalAdmin(req)
  if (!admin) {
    return jsonError(res, "Требуется вход", 401)
  }

  const { id } = req.params
  const parsed = branchContactsPatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  try {
    checkBranchAccess(admin, id)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }

  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }

  const d = parsed.data
  const data: Prisma.BranchUpdateInput = {}
  if (d.titleRu !== undefined) data.titleRu = d.titleRu
  if (d.titleKz !== undefined) data.titleKz = d.titleKz
  if (d.subtitle !== undefined) data.subtitle = strOrNull(d.subtitle)
  if (d.subtitleKz !== undefined) data.subtitleKz = strOrNull(d.subtitleKz)
  if (d.cityLabel !== undefined) data.cityLabel = strOrNull(d.cityLabel)
  if (d.cityLabelKz !== undefined) data.cityLabelKz = strOrNull(d.cityLabelKz)
  if (d.cardImageUrl !== undefined) data.cardImageUrl = strOrNull(d.cardImageUrl)
  if (d.heroImageUrl !== undefined) data.heroImageUrl = strOrNull(d.heroImageUrl)
  if (d.address !== undefined) data.address = strOrNull(d.address)
  if (d.addressKz !== undefined) data.addressKz = strOrNull(d.addressKz)
  if (d.phone !== undefined) data.phone = strOrNull(d.phone)
  if (d.email !== undefined) data.email = strOrNull(d.email)
  if (d.hours !== undefined) data.hours = strOrNull(d.hours)
  if (d.descriptionRu !== undefined) data.descriptionRu = d.descriptionRu ?? ""
  if (d.descriptionKz !== undefined) data.descriptionKz = d.descriptionKz
  if (d.socialLinksJson !== undefined) {
    try {
      data.socialLinksJson = parseBranchSocialLinksInput(d.socialLinksJson)
    } catch (e) {
      const code = e instanceof Error ? e.message : ""
      if (code === "INVALID_SOCIAL_URL") {
        return jsonError(res, "В socialLinksJson указан некорректный URL", 400)
      }
      return jsonError(
        res,
        "Соцсети: ожидается массив объектов с полями label и url (опционально icon)",
        400
      )
    }
  }

  if (Object.keys(data).length === 0) {
    return jsonError(res, "Нет полей для обновления", 400)
  }

  try {
    const row = await prisma.branch.update({ where: { id }, data })
    return res.json(row)
  } catch (e) {
    console.error("[PATCH /branches/:id/contacts]", e)
    return jsonError(res, "Не удалось сохранить", 500)
  }
}

export async function branchesDelete(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  const [users, newsN, evN] = await Promise.all([
    prisma.user.count({ where: { branchId: id } }),
    prisma.newsArticle.count({ where: { branchId: id } }),
    prisma.event.count({ where: { branchId: id } }),
  ])
  if (users + newsN + evN > 0) {
    return jsonError(
      res,
      "Нельзя удалить филиал: есть привязанные администраторы или материалы. Сначала переназначьте их.",
      409
    )
  }
  try {
    await prisma.branch.delete({ where: { id } })
    return res.status(204).send()
  } catch (e) {
    console.error("[DELETE /branches/:id]", e)
    return jsonError(res, "Не удалось удалить", 500)
  }
}

export async function branchesGetAdministrator(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Филиал не найден", 404)
  }
  const admin = await prisma.user.findFirst({
    where: { branchId: id, role: "ADMIN" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      login: true,
      email: true,
      name: true,
      role: true,
      branchId: true,
      createdAt: true,
    },
  })
  return res.json({ administrator: admin || null })
}

const setAdministratorSchema = z.object({
  userId: z.string().min(1).nullable(),
})

export async function branchesSetAdministrator(req: Request, res: Response) {
  const { id } = req.params
  const parsed = setAdministratorSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const { userId } = parsed.data

  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Филиал не найден", 404)
  }

  if (userId === null) {
    const current = await prisma.user.findFirst({
      where: { branchId: id, role: "ADMIN" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })
    if (current) {
      await prisma.user.update({
        where: { id: current.id },
        data: { branchId: null },
      })
    }
    return res.json({ success: true, administrator: null })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return jsonError(res, "Пользователь не найден", 404)
  }

  if (user.role !== "ADMIN") {
    return jsonError(res, "Пользователь должен иметь роль администратора", 400)
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { branchId: id },
    select: {
      id: true,
      login: true,
      email: true,
      name: true,
      role: true,
      branchId: true,
      createdAt: true,
    },
  })

  return res.json({ success: true, administrator: updated })
}
