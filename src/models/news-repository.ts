import type { NewsArticle, Prisma, PublishStatus } from "@prisma/client"

import { prisma } from "../prisma.js"

const publishedWhere: Prisma.NewsArticleWhereInput = {
  status: "PUBLISHED",
  publishedAt: { not: null },
}

export async function listPublishedNews(): Promise<NewsArticle[]> {
  return prisma.newsArticle.findMany({
    where: publishedWhere,
    orderBy: { publishedAt: "desc" },
  })
}

/** Публичная лента: только глобальные (branchId null) или конкретный филиал. */
export async function listPublishedNewsPublic(options?: {
  limit?: number
  orderByCreatedAt?: boolean
  /** Не задано или null → только сеть (branchId = null). Строка → только этот филиал. */
  branchId?: string | null
}): Promise<NewsArticle[]> {
  const orderByCreated = options?.orderByCreatedAt ?? false
  const branchId =
    options?.branchId === undefined ? null : options.branchId
  return prisma.newsArticle.findMany({
    where: {
      ...publishedWhere,
      branchId,
    },
    orderBy: orderByCreated
      ? { createdAt: "desc" }
      : { publishedAt: "desc" },
    take: options?.limit,
  })
}

export async function listNewsForAdmin(
  status?: PublishStatus,
  branchId?: string | null
): Promise<NewsArticle[]> {
  const where: Prisma.NewsArticleWhereInput = {
    ...(status ? { status } : {}),
    ...(branchId !== undefined ? { branchId } : {}),
  }
  return prisma.newsArticle.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  })
}

export async function findNewsById(id: string): Promise<NewsArticle | null> {
  return prisma.newsArticle.findUnique({ where: { id } })
}

export async function findNewsBySlug(slug: string): Promise<NewsArticle | null> {
  return prisma.newsArticle.findUnique({ where: { slug } })
}
