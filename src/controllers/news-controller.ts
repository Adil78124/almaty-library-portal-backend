import type { NewsArticle, PublishStatus } from "@prisma/client"
import { Prisma } from "@prisma/client"
import type { Request, Response } from "express"
import type { z } from "zod"

import { parseApiLang, pickApiLang, type ApiLang } from "../lib/api-lang.js"
import { getOptionalAdmin, requireAdminJson, type AdminPrincipal } from "../lib/auth.js"
import { jsonError, jsonValidationError } from "../lib/http.js"
import { assertBranchScopedResource } from "../lib/resource-access.js"
import { parsePublishedAtInput } from "../lib/publish-date.js"
import {
  findNewsById,
  findNewsBySlug,
  listNewsForAdmin,
  listPublishedNewsPublic,
} from "../models/news-repository.js"
import { prisma } from "../prisma.js"
import { newsCreateSchema, newsUpdateSchema } from "../validators/content.js"

type NewsUpdate = z.infer<typeof newsUpdateSchema>

type HomePublishStatus = "PENDING" | "APPROVED" | "REJECTED"
type BranchRelation = {
  branch?: { titleRu: string; titleKz: string | null } | null
}

type ContentScope = "main" | "branches" | "all"
function parseContentScope(req: Request): ContentScope {
  const raw = req.query.type
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === "branches" || v === "all" || v === "main") return v
  return "main"
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  )
}

function uniqueViolationTargets(e: unknown): string[] | undefined {
  if (typeof e !== "object" || e === null || !("meta" in e)) return undefined
  const meta = (e as { meta?: { target?: string[] } }).meta
  return meta?.target
}

function serializeNewsArticleAdmin(item: NewsArticle & BranchRelation) {
  return {
    id: item.id,
    slug: item.slug,
    titleRu: item.titleRu,
    titleKz: item.titleKz ?? null,
    descriptionRu: item.descriptionRu,
    descriptionKz: item.descriptionKz ?? null,
    coverImageUrl: item.coverImageUrl,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    location: item.location,
    locationKz: item.locationKz ?? null,
    curator: item.curator,
    curatorKz: item.curatorKz ?? null,
    status: item.status,
    sortOrder: item.sortOrder,
    branchId: item.branchId,
    branchTitleRu: item.branch?.titleRu ?? null,
    branchTitleKz: item.branch?.titleKz ?? null,
    showOnHomeRequested: item.showOnHomeRequested,
    homePublishStatus: item.homePublishStatus,
    homePublishRequestedAt: item.homePublishRequestedAt?.toISOString() ?? null,
    homePublishReviewedAt: item.homePublishReviewedAt?.toISOString() ?? null,
    homePublishReviewedBy: item.homePublishReviewedBy,
    homePublishRejectReason: item.homePublishRejectReason,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

function serializeNewsPublic(item: NewsArticle & BranchRelation, lang: ApiLang) {
  return {
    id: item.id,
    slug: item.slug,
    title: pickApiLang(lang, item.titleRu, item.titleKz),
    description: pickApiLang(
      lang,
      item.descriptionRu,
      item.descriptionKz
    ),
    coverImageUrl: item.coverImageUrl,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    location: pickApiLang(lang, item.location, item.locationKz),
    curator: pickApiLang(lang, item.curator, item.curatorKz),
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
): Partial<Prisma.NewsArticleUncheckedCreateInput> {
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
  data: Prisma.NewsArticleUncheckedUpdateInput,
  existing: NewsArticle,
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

async function resolveArticle(param: string) {
  const byId = await findNewsById(param)
  if (byId) return byId
  return findNewsBySlug(param)
}

function canReadPublic(item: {
  status: string
  publishedAt: Date | null
}): boolean {
  return item.status === "PUBLISHED" && item.publishedAt != null
}

function buildUpdateInput(d: NewsUpdate): Prisma.NewsArticleUncheckedUpdateInput {
  const data: Prisma.NewsArticleUncheckedUpdateInput = {}
  if (d.slug !== undefined) data.slug = d.slug
  if (d.titleRu !== undefined) data.titleRu = d.titleRu
  if (d.titleKz !== undefined) data.titleKz = d.titleKz ?? null
  if (d.descriptionRu !== undefined) data.descriptionRu = d.descriptionRu
  if (d.descriptionKz !== undefined) data.descriptionKz = d.descriptionKz ?? null
  if (d.coverImageUrl !== undefined) data.coverImageUrl = d.coverImageUrl
  if (d.location !== undefined) data.location = d.location
  if (d.locationKz !== undefined) data.locationKz = d.locationKz
  if (d.curator !== undefined) data.curator = d.curator
  if (d.curatorKz !== undefined) data.curatorKz = d.curatorKz
  if (d.status !== undefined) data.status = d.status
  if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder
  if (d.publishedAt !== undefined) {
    data.publishedAt = parsePublishedAtInput(d.publishedAt)
  }
  return data
}

export async function newsList(req: Request, res: Response) {
  const admin = await getOptionalAdmin(req)
  const statusRaw = req.query.status
  const status =
    typeof statusRaw === "string" ? (statusRaw as PublishStatus) : undefined
  const all = req.query.all === "1"

  if (admin && (all || status)) {
    const scope = parseContentScope(req)
    const items =
      admin.role === "ADMIN" && admin.branchId
        ? await listNewsForAdmin(status ?? undefined, admin.branchId)
        : scope === "main"
          ? await listNewsForAdmin(status ?? undefined, null)
          : scope === "branches"
            ? await prisma.newsArticle.findMany({
                where: { ...(status ? { status } : {}), branchId: { not: null } },
                orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
              })
            : await listNewsForAdmin(status ?? undefined)
    return res.json(items.map(serializeNewsArticleAdmin))
  }

  const limitQ = req.query.limit
  const limitRaw = Array.isArray(limitQ) ? limitQ[0] : limitQ
  const limit =
    limitRaw !== undefined && limitRaw !== ""
      ? Math.min(
          50,
          Math.max(1, Number.parseInt(String(limitRaw), 10) || 1)
        )
      : undefined
  const sortQ = req.query.sort
  const sort = Array.isArray(sortQ) ? sortQ[0] : sortQ
  const orderByCreatedAt =
    sort === "desc" || sort === "created" || (limit != null && sort !== "published")

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

  const items = await listPublishedNewsPublic({
    limit,
    orderByCreatedAt,
    branchId: branchIdFilter,
    includeApprovedBranches: branchIdFilter == null && limit != null,
  })
  const lang = parseApiLang(req)
  // Всегда публичная форма для ленты с `limit` (главная, polling): иначе у админа
  // приходят `titleRu`/`descriptionRu`, а не `title`/`description`.
  return res.json(items.map((i) => serializeNewsPublic(i, lang)))
}

export async function newsCreate(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const parsed = newsCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  const publishedAtRaw = parsePublishedAtInput(parsed.data.publishedAt)
  const publishedAt =
    publishedAtRaw === undefined ? null : publishedAtRaw

  const { branchId: bodyBranchId, ...newsFields } = parsed.data

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
    const item = await prisma.newsArticle.create({
      data: {
        slug: newsFields.slug,
        titleRu: newsFields.titleRu,
        titleKz: newsFields.titleKz ?? null,
        descriptionRu: newsFields.descriptionRu,
        descriptionKz: newsFields.descriptionKz ?? null,
        coverImageUrl: newsFields.coverImageUrl ?? null,
        location: newsFields.location ?? null,
        locationKz: newsFields.locationKz ?? null,
        curator: newsFields.curator ?? null,
        curatorKz: newsFields.curatorKz ?? null,
        publishedAt,
        status: newsFields.status ?? "DRAFT",
        sortOrder: newsFields.sortOrder ?? 0,
        branchId,
        ...homePublishCreateData(admin, branchId, newsFields),
      },
      include: { branch: true },
    })
    return res.status(201).json(serializeNewsArticleAdmin(item))
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      const targets = uniqueViolationTargets(e)
      const slugField = targets?.some((t) => String(t).includes("slug"))
      return jsonError(
        res,
        slugField
          ? `Slug «${parsed.data.slug}» уже занят. Укажите другой адрес в поле Slug (например, добавьте суффикс: ${parsed.data.slug}-2).`
          : "Такое значение уже есть в базе (уникальное поле).",
        409
      )
    }
    console.error("[POST /api/news]", e)
    const hint =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? ` (${e.message})`
        : ""
    return jsonError(
      res,
      `Не удалось создать новость. Попробуйте позже.${hint}`,
      500
    )
  }
}

export async function newsGetById(req: Request, res: Response) {
  const param = req.params.id
  const item = await resolveArticle(param)
  if (!item) {
    return jsonError(res, "Не найдено", 404)
  }

  const admin = await getOptionalAdmin(req)
  if (!canReadPublic(item)) {
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
    return res.json(serializeNewsArticleAdmin(item))
  }
  return res.json(serializeNewsPublic(item, parseApiLang(req)))
}

export async function newsUpdate(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const { id } = req.params
  const existing = await findNewsById(id)
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  try {
    assertBranchScopedResource(admin, existing.branchId)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }

  const parsed = newsUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  const data: Prisma.NewsArticleUncheckedUpdateInput = buildUpdateInput(parsed.data)
  if (admin.role === "SUPER_ADMIN" && parsed.data.branchId !== undefined) {
    const bid = parsed.data.branchId
    if (bid === null) {
      data.branchId = null
    } else {
      const br = await prisma.branch.findUnique({ where: { id: bid } })
      if (!br) {
        return jsonError(res, "Филиал не найден", 400)
      }
      data.branchId = bid
    }
  }
  applyHomePublishUpdate(data, existing, admin, parsed.data)

  try {
    const item = await prisma.newsArticle.update({
      where: { id },
      data,
      include: { branch: true },
    })
    return res.json(serializeNewsArticleAdmin(item))
  } catch (e) {
    const isUnique =
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    if (isUnique) {
      const targets = (e as { meta?: { target?: string[] } }).meta?.target
      const slugField = targets?.some((t) => String(t).includes("slug"))
      return jsonError(
        res,
        slugField
          ? "Этот slug уже занят другой новостью. Укажите уникальный адрес."
          : "Такое значение уже есть в базе (уникальное поле).",
        409
      )
    }
    console.error("[PUT /api/news/:id]", e)
    const hint =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? ` (${e.message})`
        : ""
    return jsonError(res, `Не удалось сохранить. Попробуйте позже.${hint}`, 500)
  }
}

export async function newsDelete(req: Request, res: Response) {
  const admin = await requireAdminJson(req, res)
  if (!admin) return

  const { id } = req.params
  const existing = await findNewsById(id)
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }
  try {
    assertBranchScopedResource(admin, existing.branchId)
  } catch {
    return jsonError(res, "Forbidden", 403)
  }

  try {
    await prisma.newsArticle.delete({ where: { id } })
    return res.status(204).send()
  } catch {
    return jsonError(res, "Не найдено", 404)
  }
}
