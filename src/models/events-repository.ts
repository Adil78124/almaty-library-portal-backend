import type { Event, Prisma, PublishStatus } from "@prisma/client"

import { prisma } from "../prisma.js"

const publishedWhere: Prisma.EventWhereInput = { status: "PUBLISHED" }

/**
 * Глобальная афиша (без branchId / null): предстоящие с датой, branchId null.
 * Конкретный филиал: все опубликованные события этого филиала.
 */
export async function listPublishedEventsPublic(options: {
  limit: number
  branchId?: string | null
  includeApprovedBranches?: boolean
}): Promise<Event[]> {
  const now = new Date()
  const branchFilter = options.branchId

  if (branchFilter === undefined || branchFilter === null) {
    const scopeWhere: Prisma.EventWhereInput =
      options.includeApprovedBranches === true
        ? {
            OR: [
              { branchId: null },
              { branchId: { not: null }, homePublishStatus: "APPROVED" },
            ],
          }
        : { branchId: null }
    const upcomingGlobal = await prisma.event.findMany({
      where: {
        ...publishedWhere,
        startsAt: { not: null, gte: now },
        ...scopeWhere,
      },
      orderBy: [{ startsAt: "asc" }, { updatedAt: "desc" }],
      include: { branch: true },
      take: options.limit,
    })
    if (upcomingGlobal.length > 0) return upcomingGlobal

    return prisma.event.findMany({
      where: { ...publishedWhere, ...scopeWhere },
      orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
      include: { branch: true },
      take: options.limit,
    })
  }

  return prisma.event.findMany({
    where: {
      ...publishedWhere,
      branchId: branchFilter,
    },
    orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
    include: { branch: true },
    take: options.limit,
  })
}

export async function listEventsForAdmin(
  status?: PublishStatus,
  branchId?: string | null
): Promise<Event[]> {
  const where: Prisma.EventWhereInput = {
    ...(status ? { status } : {}),
    ...(branchId !== undefined ? { branchId } : {}),
  }
  return prisma.event.findMany({
    where,
    orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
  })
}
