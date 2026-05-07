import { Router } from "express"
import { z } from "zod"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"
import { requireRole } from "../middleware/requireRole.js"

export const pagesRouter = Router()

const pageUpsertSchema = z.object({
  page: z.string().min(1).max(200),
  // Храним как Prisma Json. Валидация формы — на фронте/админке (специфична для разных страниц).
  sections: z.unknown(),
})

pagesRouter.get("/", async (req, res) => {
  const page = typeof req.query.page === "string" ? req.query.page : null

  if (page) {
    const row = await prisma.pageContent.findUnique({ where: { page } })
    return res.json({ page, sections: row?.sections ?? null })
  }

  const rows = await prisma.pageContent.findMany({ orderBy: { updatedAt: "desc" } })
  return res.json(
    rows.map((r) => ({
      page: r.page,
      sections: r.sections,
      updatedAt: r.updatedAt.toISOString(),
    }))
  )
})

pagesRouter.post("/", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const parsed = pageUpsertSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  const { page, sections } = parsed.data

  try {
    const row = await prisma.pageContent.upsert({
      where: { page },
      create: { page, sections: sections as object },
      update: { sections: sections as object },
    })
    return res.status(201).json({
      page: row.page,
      sections: row.sections,
      updatedAt: row.updatedAt.toISOString(),
    })
  } catch (e) {
    console.error("[POST /pages]", e)
    return jsonError(res, "Не удалось сохранить страницу", 500)
  }
})

