import type { Request, Response } from "express"
import { z } from "zod"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { verifyPassword } from "../lib/password.js"
import { prisma } from "../prisma.js"
import { createAuthToken } from "../lib/session.js"

const loginSchema = z
  .object({
    login: z.string().optional(),
    email: z.string().optional(),
    password: z.string().min(1),
  })
  .transform((d) => ({
    keyRaw: (d.login ?? d.email ?? "").trim(),
    password: d.password,
  }))
  .pipe(
    z.object({
      keyRaw: z.string().min(1, "Укажите логин или email"),
      password: z.string().min(1),
    })
  )

function normalizeKey(s: string): string {
  return s.trim().toLowerCase()
}

export async function authLogin(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const { keyRaw, password } = parsed.data
  const key = normalizeKey(keyRaw)
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: key }, { login: key }] },
  })
  if (!user) {
    return jsonError(res, "Неверный логин или пароль", 401)
  }
  const ok = await verifyPassword(password, user.password)
  if (!ok) {
    return jsonError(res, "Неверный логин или пароль", 401)
  }
  const token = await createAuthToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  })
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      name: user.name,
    },
  })
}
