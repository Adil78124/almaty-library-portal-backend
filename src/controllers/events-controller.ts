import type { Event, Prisma, PublishStatus } from "@prisma/client"
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/library"
import type { Request, Response } from "express"

import { parseApiLang, pickApiLang, type ApiLang } from "../lib/api-lang.js"
import { getOptionalAdmin, requireAdminJson, type AdminPrincipal } from "../lib/auth.js"
import { jsonError, jsonValidationError } from "../lib/http.js"
import { assertBranchScopedResource } from "../lib/resource-access.js"
import {
  listEventsForAdmin,
  listPublishedEventsPublic,
} from "../models/events-repository.js"
import { prisma } from "../prisma.js"
import { eventCreateSchema, eventUpdateSchema } from "../validators/content.js"

type ContentScope = "main" | "branches" | "all"
type HomePublishStatus = "PENDING" | "APPROVED" | "REJECTED"
type BranchRelation = {
  branch?: { titleRu: string; titleKz: string | null } | null
}
function parseContentScope(req: Request): ContentScope {
  const raw = req.query.type
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === "branches" || v === "all" || v === "main") return v
  return "main"
}

function serializeEventAdmin(item: Event & BranchRelation) {
  return {
    ...item,
    startsAt: item.startsAt?.toISOString() ?? null,
    branchTitleRu: item.branch?.titleRu ?? null,
    branchTitleKz: item.branch?.titleKz ?? null,
    homePublishRequestedAt: item.homePublishRequestedAt?.toISOString() ?? null,
    homePublishReviewedAt: item.homePublishReviewedAt?.toISOString() ?? null,
  }
}

function serializeEventPublic(item: Event & BranchRelation, lang: ApiLang) {
  return {
    id: item.id,
    slug: item.slug,
    title: pickApiLang(lang, item.titleRu, item.titleKz),
    description: pickApiLang(
      lang,
      item.descriptionRu,
      item.descriptionKz
    ),
    posterUrl: item.posterUrl,
    startsAt: item.startsAt?.toISOString() ?? null,
    timeDisplay: pickApiLang(lang, item.timeDisplay, item.timeDisplayKz),
    format: pickApiLang(lang, item.format, item.formatKz),
    category: pickApiLang(lang, item.category, item.categoryKz),
    location: pickApiLang(lang, item.location, item.locationKz),
    ctaLabel: pickApiLang(lang, item.ctaLabel, item.ctaLabelKz),
    ctaHref: item.ctaHref,
    featuredOnHome: item.featuredOnHome,
    branchId: item.branchId,
    branchTitle: item.branchId
      ? pickApiLang(lang, item.branch?.titleRu ?? null, item.branch?.titleKz ?? null)
      : null,
  }
}

function homePublishCreateData(
  admin: AdminPrincipal,
  branchId: string | null,
  input: {
    showOnHomeRequested?: boolean
    homePublishStatus?: HomePublishStatus | null
    homePublishRejectReason?: string | null
  }
): Partial<Prisma.EventUncheckedCreateInput> {
  if (!branchId) {
    return {
      showOnHomeRequested: false,
      homePublishStatus: null,
      homePublishRequestedAt: null,
      homePublishReviewedAt: null,
      homePublishReviewedBy: null,
      homePublishRejectReason: null,
    }
  }

  const requestedByBranch = admin.role === "ADMIN" && input.showOnHomeRequested === true
  const status =
    admin.role === "SUPER_ADMIN"
      ? input.homePublishStatus ?? (input.showOnHomeRequested ? "PENDING" : null)
      : requestedByBranch
        ? "PENDING"
        : null
  const reviewed = status === "APPROVED" || status === "REJECTED"

  return {
    showOnHomeRequested: status === "APPROVED" || status === "PENDING" || requestedByBranch,
    homePublishStatus: status,
    homePublishRequestedAt: status ? new Date() : null,
    homePublishReviewedAt: reviewed ? new Date() : null,
    homePublishReviewedBy: reviewed ? admin.id : null,
    homePublishRejectReason:
      status === "REJECTED" ? input.homePublishRejectReason ?? null : null,
  }
}

function applyHomePublishUpdate(
  data: Prisma.EventUncheckedUpdateInput,
  existing: Event,
  admin: AdminPrincipal,
  input: {
    showOnHomeRequested?: boolean
    homePublishStatus?: HomePublishStatus | null
    homePublishRejectReason?: string | null
  }
) {
  if (!existing.branchId) {
    data.showOnHomeRequested = false
    data.homePublishStatus = null
    data.homePublishRequestedAt = null
    data.homePublishReviewedAt = null
    data.homePublishReviewedBy = null
    data.homePublishRejectReason = null
    return
  }

  if (admin.role === "SUPER_ADMIN") {
    if (input.homePublishStatus === undefined) {
      if (input.showOnHomeRequested !== undefined) {
        data.showOnHomeRequested = input.showOnHomeRequested
      }
      return
    }
    const status = input.homePublishStatus
    data.showOnHomeRequested = status === "APPROVED" || status === "PENDING"
    data.homePublishStatus = status
    data.homePublishRequestedAt =
      status === "PENDING" && !existing.homePublishRequestedAt
        ? new Date()
        : existing.homePublishRequestedAt
    data.homePublishReviewedAt =
      status === "APPROVED" || status === "REJECTED" ? new Date() : null
    data.homePublishReviewedBy =
      status === "APPROVED" || status === "REJECTED" ? admin.id : null
    data.homePublishRejectReason =
      status === "REJECTED" ? input.homePublishRejectReason ?? null : null
    return
  }

  if (input.showOnHomeRequested !== undefined) {
    data.showOnHomeRequested = input.showOnHomeRequested
    data.homePublishStatus = input.showOnHomeRequested ? "PENDING" : null
    data.homePublishRequestedAt = input.showOnHomeRequested ? new Date() : null
    data.homePublishReviewedAt = null
    data.homePublishReviewedBy = null
    data.homePublishRejectReason = null
    return
  }

  if (existing.homePublishStatus === "APPROVED") {
    data.showOnHomeRequested = true
    data.homePublishStatus = "PENDING"
    data.homePublishRequestedAt = new Date()
    data.homePublishReviewedAt = null
    data.homePublishReviewedBy = null
    data.homePublishRejectReason = null
  }
}

export async function eventsList(req: Request, res: Response) {
  const limitQ = req.query.limit
  const limitRaw = Array.isArray(limitQ) ? limitQ[0] : limitQ
  if (limitRaw !== undefined && limitRaw !== "") {
    const limit = Math.min(20, Math.max(1, parseInt(String(limitRaw), 10) || 4))
    const branchIdRaw = req.query.branchId
    const branchIdFilter =
      typeof branchIdRaw === "string" && branchIdRaw.trim() !== ""
        ? branchIdRaw.trim()
        : null
    if (branchIdFilter) {
      const br = await prisma.branch.findFirst({
        where: { id: branchIdFilter, published: true },
      })
      if (!br) {
        return res.json([])
      }
    }
    const items = await listPublishedEventsPublic({
      limit,
      branchId: branchIdFilter,
      includeApprovedBranches: branchIdFilter == null,
    })
    // Всегда публичная форма (`title`, `description`, …): иначе залогиненный админ
    // на главной получает сырой Prisma-объект (`titleRu`), а клиентский маппер ломается.
    const lang = parseApiLang(req)
    return res.json(items.map((i) => serializeEventPublic(i, lang)))
  }

  const admin = await getOptionalAdmin(req)
  const statusRaw = req.query.status
  const status =
    typeof statusRaw === "string" ? (statusRaw as PublishStatus) : undefined
  const featured = req.query.featuredOnHome
  const all = req.query.all === "1"

  if (admin && (all || status)) {
    const scope = parseContentScope(req)
    const items =
      admin.role === "ADMIN" && admin.branchId
        ? await listEventsForAdmin(status ?? undefined, admin.branchId)
        : scope === "main"
          ? await listEventsForAdmin(status ?? undefined, null)
          : scope === "branches"
            ? await prisma.event.findMany({
                where: { ...(status ? { status } : {}), branchId: { not: null } },
                orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }],
              })
            : await listEventsForAdmin(status ?? undefined)
    return res.json(items.map(serializeEventAdmin))
  }

  const where: {
    status?: PublishStatus
    featuredOnHome?: boolean
  } = {}
  if (!admin && !all) {
    where.status = "PUBLISHED"
  } else if (status) {
    where.status = status
  }
  if (featured === "true") {
    where.featuredOnHome = true
  }
  if (admin?.role === "ADMIN" && admin.branchId) {
    const items = await prisma.event.findMany({
      where: { ...where, branchId: admin.branchId },
      orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }],
    })
    return res.json(items.map(serializeEventAdmin))
  }
  const items = await prisma.event.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }],
  })
  const lang = parseApiLang(req)
  if (admin) {
    return res.json(items.map(serializeEventAdmin))
  }
  return res.json(items.map((i) => serializeEventPublic(i, lang)))
}

export async function eventsCreate(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const parsed = eventCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const {
    startsAt,
    branchId: bodyBranchId,
    showOnHomeRequested,
    homePublishStatus,
    homePublishRejectReason,
    ...rest
  } = parsed.data
  const slug = rest.slug.trim()
  if (!slug) {
    return jsonError(
      res,
      "Адрес страницы (slug) не может быть пустым или из одних пробелов.",
      400
    )
  }

  const taken = await prisma.event.findUnique({ where: { slug } })
  if (taken) {
    return jsonError(
      res,
      "Этот адрес страницы уже занят другим мероприятием. Задайте другой slug.",
      409
    )
  }

  let startsAtDate: Date | null = null
  if (startsAt) {
    const d = new Date(startsAt)
    if (Number.isNaN(d.getTime())) {
      return jsonError(res, "Некорректная дата и время начала.", 400)
    }
    startsAtDate = d
  }

  let branchId: string | null
  if (admin.role === "SUPER_ADMIN") {
    if (bodyBranchId === undefined || bodyBranchId === null) {
      branchId = null
    } else {
      const br = await prisma.branch.findUnique({
        where: { id: bodyBranchId },
      })
      if (!br) {
        return jsonError(res, "Филиал не найден", 400)
      }
      branchId = bodyBranchId
    }
  } else {
    branchId = admin.branchId ?? null
  }

  if (admin.role === "ADMIN" && !branchId) {
    return jsonError(res, "У учётной записи не задан филиал", 403)
  }

  try {
    const item = await prisma.event.create({
      data: {
        ...rest,
        slug,
        startsAt: startsAtDate,
        branchId,
        ...homePublishCreateData(admin, branchId, {
          showOnHomeRequested,
          homePublishStatus,
          homePublishRejectReason,
        }),
      },
      include: { branch: true },
    })
    return res.status(201).json(serializeEventAdmin(item))
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError(
        res,
        "Этот адрес страницы уже занят (конфликт уникальности). Задайте другой slug.",
        409
      )
    }
    if (
      e instanceof PrismaClientValidationError &&
      typeof e.message === "string" &&
      e.message.includes("Unknown argument")
    ) {
      console.error("[POST /api/events] Stale Prisma/Next cache (regenerate + clear .next)", e)
      return jsonError(
        res,
        "Кэш dev-сервера устарел: остановите pnpm dev, выполните pnpm exec prisma generate, удалите папку .next и снова запустите dev.",
        500
      )
    }
    console.error("[POST /api/events]", e)
    return jsonError(
      res,
      "Не удалось создать мероприятие. Подробности в логе сервера (терминал с pnpm dev).",
      500
    )
  }
}

function canReadEventPublic(item: { status: string }): boolean {
  return item.status === "PUBLISHED"
}

export async function eventsGetById(req: Request, res: Response) {
  const { id } = req.params
  const item = await prisma.event.findUnique({ where: { id } })
  if (!item) {
    return jsonError(res, "Не найдено", 404)
  }

  const admin = await getOptionalAdmin(req)
  if (!canReadEventPublic(item)) {
    if (!admin) {
      return jsonError(res, "Не найдено", 404)
    }
    try {
      assertBranchScopedResource(admin, item.branchId)
    } catch {
      return jsonError(res, "Не найдено", 404)
    }
  }

  if (admin) {
    return res.json(serializeEventAdmin(item))
  }
  return res.json(serializeEventPublic(item, parseApiLang(req)))
}

export async function eventsPatch(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const { id } = req.params
  const existing = await prisma.event.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  try {
    assertBranchScopedResource(admin, existing.branchId)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }

  const parsed = eventUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const {
    startsAt,
    branchId: patchBranchId,
    showOnHomeRequested,
    homePublishStatus,
    homePublishRejectReason,
    ...rest
  } = parsed.data
  const data: Prisma.EventUncheckedUpdateInput = {
    ...(rest as Prisma.EventUncheckedUpdateInput),
    ...(startsAt !== undefined
      ? { startsAt: startsAt ? new Date(startsAt) : null }
      : {}),
  }
  if (admin.role === "SUPER_ADMIN" && patchBranchId !== undefined) {
    if (patchBranchId === null) {
      data.branchId = null
    } else {
      const br = await prisma.branch.findUnique({ where: { id: patchBranchId } })
      if (!br) {
        return jsonError(res, "Филиал не найден", 400)
      }
      data.branchId = patchBranchId
    }
  }
  applyHomePublishUpdate(data, existing, admin, {
    showOnHomeRequested,
    homePublishStatus,
    homePublishRejectReason,
  })
  try {
    const item = await prisma.event.update({
      where: { id },
      data,
      include: { branch: true },
    })
    return res.json(serializeEventAdmin(item))
  } catch {
    return jsonError(res, "Не найдено", 404)
  }
}

export async function eventsDelete(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const { id } = req.params
  const existing = await prisma.event.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  try {
    assertBranchScopedResource(admin, existing.branchId)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }

  try {
    await prisma.event.delete({ where: { id } })
    return res.status(204).send()
  } catch {
    return jsonError(res, "Не найдено", 404)
  }
}
