import type { Staff, StaffSection } from "@prisma/client"
import type { Request, Response } from "express"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"
import {
  staffCreateSchema,
  staffSectionCreateSchema,
  staffSectionUpdateSchema,
  staffUpdateSchema,
} from "../validators/staff.js"

const DEFAULT_STAFF_SECTION_ID = "staff-section-district-leaders"
const DEFAULT_STAFF_SECTION_RU = "Руководители районных библиотек"
const DEFAULT_STAFF_SECTION_KZ = "Аудандық кітапханалар директорлары"

type SectionWithStaff = StaffSection & { staff?: Staff[] }

function serializeStaff(item: Staff) {
  return {
    id: item.id,
    slug: item.slug,
    sectionId: item.sectionId,
    fullNameRu: item.fullNameRu,
    fullNameKz: item.fullNameKz ?? null,
    birthDate: item.birthDate?.toISOString() ?? null,
    phone: item.phone ?? null,
    email: item.email ?? null,
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

function serializeSection(section: SectionWithStaff) {
  return {
    id: section.id,
    titleRu: section.titleRu,
    titleKz: section.titleKz ?? null,
    sortOrder: section.sortOrder,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
    staff: section.staff?.map(serializeStaff) ?? [],
  }
}

async function ensureDefaultStaffSection() {
  return prisma.staffSection.upsert({
    where: { id: DEFAULT_STAFF_SECTION_ID },
    create: {
      id: DEFAULT_STAFF_SECTION_ID,
      titleRu: DEFAULT_STAFF_SECTION_RU,
      titleKz: DEFAULT_STAFF_SECTION_KZ,
      sortOrder: 0,
    },
    update: {},
  })
}

async function resolveSectionId(sectionId: string | null | undefined) {
  const targetId = sectionId || (await ensureDefaultStaffSection()).id
  const section = await prisma.staffSection.findUnique({ where: { id: targetId } })
  return section?.id ?? null
}

export async function staffSectionList(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === "1"
  await ensureDefaultStaffSection()

  const sections = await prisma.staffSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { titleRu: "asc" }],
    include: {
      staff: {
        where: activeOnly ? { isActive: true } : undefined,
        orderBy: [{ sortOrder: "asc" }, { fullNameRu: "asc" }],
      },
    },
  })

  const filtered = activeOnly
    ? sections.filter((section) => section.staff.length > 0)
    : sections

  return res.json(filtered.map(serializeSection))
}

export async function staffSectionCreate(req: Request, res: Response) {
  const parsed = staffSectionCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  try {
    const row = await prisma.staffSection.create({
      data: {
        titleRu: parsed.data.titleRu,
        titleKz: parsed.data.titleKz ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    })
    return res.status(201).json(serializeSection(row))
  } catch (e) {
    console.error("[POST /staff/sections]", e)
    return jsonError(res, "Не удалось создать секцию сотрудников", 500)
  }
}

export async function staffSectionPatch(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.staffSection.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }

  const parsed = staffSectionUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  try {
    const row = await prisma.staffSection.update({
      where: { id },
      data: {
        ...(parsed.data.titleRu !== undefined ? { titleRu: parsed.data.titleRu } : {}),
        ...(parsed.data.titleKz !== undefined ? { titleKz: parsed.data.titleKz } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      },
    })
    return res.json(serializeSection(row))
  } catch (e) {
    console.error("[PATCH /staff/sections/:id]", e)
    return jsonError(res, "Не удалось сохранить секцию сотрудников", 500)
  }
}

export async function staffSectionDelete(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.staffSection.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }

  const staffCount = await prisma.staff.count({ where: { sectionId: id } })
  if (staffCount > 0) {
    return jsonError(
      res,
      "Сначала перенесите или удалите сотрудников из этой секции",
      409
    )
  }

  try {
    await prisma.staffSection.delete({ where: { id } })
    return res.status(204).send()
  } catch (e) {
    console.error("[DELETE /staff/sections/:id]", e)
    return jsonError(res, "Не удалось удалить секцию сотрудников", 500)
  }
}

export async function staffList(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === "1"
  await ensureDefaultStaffSection()

  const rows = await prisma.staff.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [
      { section: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { fullNameRu: "asc" },
    ],
  })
  return res.json(rows.map(serializeStaff))
}

export async function staffCreate(req: Request, res: Response) {
  const parsed = staffCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const d = parsed.data
  const sectionId = await resolveSectionId(d.sectionId)
  if (!sectionId) {
    return jsonError(res, "Секция сотрудников не найдена", 400)
  }

  try {
    const row = await prisma.staff.create({
      data: {
        slug: d.slug,
        sectionId,
        fullNameRu: d.fullNameRu,
        fullNameKz: d.fullNameKz ?? null,
        birthDate: d.birthDate ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
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

  let sectionId: string | undefined
  if (parsed.data.sectionId !== undefined) {
    const resolved = await resolveSectionId(parsed.data.sectionId)
    if (!resolved) {
      return jsonError(res, "Секция сотрудников не найдена", 400)
    }
    sectionId = resolved
  }

  try {
    const row = await prisma.staff.update({
      where: { id },
      data: {
        ...(sectionId !== undefined ? { sectionId } : {}),
        ...(parsed.data.fullNameRu !== undefined ? { fullNameRu: parsed.data.fullNameRu } : {}),
        ...(parsed.data.fullNameKz !== undefined ? { fullNameKz: parsed.data.fullNameKz } : {}),
        ...(parsed.data.birthDate !== undefined ? { birthDate: parsed.data.birthDate } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
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

export async function staffDelete(req: Request, res: Response) {
  const { id } = req.params
  const existing = await prisma.staff.findUnique({ where: { id } })
  if (!existing) {
    return jsonError(res, "Не найдено", 404)
  }

  try {
    await prisma.staff.delete({ where: { id } })
    return res.status(204).send()
  } catch (e) {
    console.error("[DELETE /staff/:id]", e)
    return jsonError(res, "Не удалось удалить", 500)
  }
}
