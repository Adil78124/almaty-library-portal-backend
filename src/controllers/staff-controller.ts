import type { Staff } from "@prisma/client"
import type { Request, Response } from "express"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"
import { staffCreateSchema, staffUpdateSchema } from "../validators/staff.js"

function serializeStaff(item: Staff) {
  return {
    id: item.id,
    slug: item.slug,
    fullNameRu: item.fullNameRu,
    fullNameKz: item.fullNameKz ?? null,
    birthDate: item.birthDate?.toISOString() ?? null,
    phone: item.phone ?? null,
    positionRu: item.positionRu ?? null,
    positionKz: item.positionKz ?? null,
    branchRu: item.branchRu,
    branchKz: item.branchKz ?? null,
    imageUrl: item.imageUrl ?? null,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

export async function staffList(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === "1"
  const rows = await prisma.staff.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { fullNameRu: "asc" }],
  })
  return res.json(rows.map(serializeStaff))
}

export async function staffCreate(req: Request, res: Response) {
  const parsed = staffCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const d = parsed.data

  try {
    const row = await prisma.staff.create({
      data: {
        slug: d.slug,
        fullNameRu: d.fullNameRu,
        fullNameKz: d.fullNameKz ?? null,
        birthDate: d.birthDate ?? null,
        phone: d.phone ?? null,
        positionRu: d.positionRu ?? null,
        positionKz: d.positionKz ?? null,
        branchRu: d.branchRu,
        branchKz: d.branchKz ?? null,
        imageUrl: d.imageUrl ?? null,
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
      },
    })
    return res.status(201).json(serializeStaff(row))
  } catch (e) {
    const isUnique =
      typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
    if (isUnique) {
      return jsonError(res, "Такой slug уже существует", 409)
    }
    console.error("[POST /staff]", e)
    return jsonError(res, "Не удалось создать сотрудника", 500)
  }
}

export async function staffPatch(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.staff.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }

  const parsed = staffUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  try {
    const row = await prisma.staff.update({
      where: { id },
      data: {
        ...(parsed.data.fullNameRu !== undefined ? { fullNameRu: parsed.data.fullNameRu } : {}),
        ...(parsed.data.fullNameKz !== undefined ? { fullNameKz: parsed.data.fullNameKz } : {}),
        ...(parsed.data.birthDate !== undefined ? { birthDate: parsed.data.birthDate } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.positionRu !== undefined ? { positionRu: parsed.data.positionRu } : {}),
        ...(parsed.data.positionKz !== undefined ? { positionKz: parsed.data.positionKz } : {}),
        ...(parsed.data.branchRu !== undefined ? { branchRu: parsed.data.branchRu } : {}),
        ...(parsed.data.branchKz !== undefined ? { branchKz: parsed.data.branchKz } : {}),
        ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    })
    return res.json(serializeStaff(row))
  } catch (e) {
    console.error("[PATCH /staff/:id]", e)
    return jsonError(res, "Не удалось сохранить", 500)
  }
}

