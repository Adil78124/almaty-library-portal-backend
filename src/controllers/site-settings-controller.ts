import type { Request, Response } from "express"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"
import {
  siteSettingsNewsHomePatchSchema,
  siteSettingsPutSchema,
} from "../validators/content.js"

export async function siteSettingsGet(_req: Request, res: Response) {
  const row = await prisma.siteSettings.findUnique({
    where: { id: "default" },
  })
  if (!row) {
    return jsonError(
      res,
      "Запись не найдена. Выполните prisma db push и npm run db:seed",
      404
    )
  }
  return res.json(row)
}

export async function siteSettingsPut(req: Request, res: Response) {
  const parsed = siteSettingsPutSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const row = await prisma.siteSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data } as never,
    update: parsed.data as never,
  })
  return res.json(row)
}

export async function siteSettingsPatch(req: Request, res: Response) {
  const parsed = siteSettingsNewsHomePatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  if (Object.keys(parsed.data).length === 0) {
    return jsonError(res, "Нет полей для обновления", 400)
  }

  const existing = await prisma.siteSettings.findUnique({
    where: { id: "default" },
  })
  if (!existing) {
    return jsonError(
      res,
      "Запись не найдена. Выполните prisma db push и npm run db:seed",
      404
    )
  }

  const row = await prisma.siteSettings.update({
    where: { id: "default" },
    data: parsed.data,
  })
  return res.json(row)
}
