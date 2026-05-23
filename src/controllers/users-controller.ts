import type { Request, Response } from "express"
import { z } from "zod"

import { getOptionalAdmin } from "../lib/auth.js"
import { jsonError, jsonValidationError } from "../lib/http.js"
import { hashPassword, verifyPassword } from "../lib/password.js"
import { ADMIN_SESSION_COOKIE, createAuthToken } from "../lib/session.js"
import { prisma } from "../prisma.js"

const loginCharsMessage =
  "Логин: только буквы, цифры, точка и дефис, без @. Смену почты укажите в поле «email», не в логине."

const createAdminSchema = z.object({
  email: z.string().email(),
  /** Уникальный логин для входа; если не задан — берётся часть до @ из email. */
  login: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Zа-яА-ЯёЁ0-9._-]+$/, loginCharsMessage)
    .optional(),
  password: z.string().min(6),
  name: z.string().min(1),
  branchId: z.string().min(1),
})

const patchMeSchema = z
  .object({
    currentPassword: z.string().min(1),
    login: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[a-zA-Zа-яА-ЯёЁ0-9._-]+$/, loginCharsMessage)
      .optional(),
    email: z.string().email().optional(),
    newPassword: z.string().min(6).optional(),
    name: z.string().min(1).optional(),
  })
  .refine(
    (d) =>
      d.login !== undefined ||
      d.email !== undefined ||
      d.newPassword !== undefined ||
      d.name !== undefined,
    { message: "Укажите хотя бы одно поле для изменения" }
  )

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function usersGetMe(req: Request, res: Response) {
  const admin = await getOptionalAdmin(req)
  if (!admin) {
    return jsonError(res, "Требуется вход", 401)
  }
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(admin.email) },
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
  if (user) {
    return res.json(user)
  }
  return res.json({
    id: admin.id,
    login: null,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    branchId: admin.branchId,
    createdAt: new Date(0).toISOString(),
  })
}

export async function usersList(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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
  return res.json(users)
}

export async function usersPatchMe(req: Request, res: Response) {
  const admin = await getOptionalAdmin(req)
  if (!admin) {
    return jsonError(res, "Требуется вход", 401)
  }

  const parsed = patchMeSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }

  const user = await prisma.user.findUnique({ where: { id: admin.id } })
  if (!user) {
    return jsonError(res, "Пользователь не найден", 404)
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.password)
  if (!ok) {
    return jsonError(res, "Неверный текущий пароль", 403)
  }

  const loginNext =
    parsed.data.login !== undefined
      ? parsed.data.login.trim().toLowerCase()
      : undefined
  const emailNext =
    parsed.data.email !== undefined
      ? normalizeEmail(parsed.data.email)
      : undefined
  const nameNext =
    parsed.data.name !== undefined ? parsed.data.name.trim() : undefined

  try {
    const passwordHash =
      parsed.data.newPassword !== undefined
        ? await hashPassword(parsed.data.newPassword)
        : undefined

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(loginNext !== undefined ? { login: loginNext } : {}),
        ...(emailNext !== undefined ? { email: emailNext } : {}),
        ...(nameNext !== undefined ? { name: nameNext } : {}),
        ...(passwordHash !== undefined ? { password: passwordHash } : {}),
      },
    })

    const token = await createAuthToken({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      branchId: updated.branchId,
    })

    const maxAgeMs = 7 * 24 * 60 * 60 * 1000
    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeMs,
    })

    return res.json({
      token,
      user: {
        id: updated.id,
        email: updated.email,
        login: updated.login,
        name: updated.name,
        role: updated.role,
        branchId: updated.branchId,
      },
    })
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined
    if (code === "P2002") {
      return jsonError(
        res,
        "Такой email или логин уже занят. Укажите другие значения.",
        409
      )
    }
    throw e
  }
}

export async function usersCreateAdmin(req: Request, res: Response) {
  const parsed = createAdminSchema.safeParse(req.body)
  if (!parsed.success) {
    return jsonValidationError(res, parsed.error)
  }
  const { email, password, name, branchId, login: loginRaw } = parsed.data
  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch) {
    return jsonError(res, "Филиал не найден", 400)
  }
  const em = normalizeEmail(email)
  const login =
    loginRaw?.trim().toLowerCase() ||
    em.split("@")[0]?.replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, "") ||
    `u${Date.now()}`
  try {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        login,
        email: em,
        password: passwordHash,
        name: name.trim(),
        role: "ADMIN",
        branchId,
      },
    })
    return res.status(201).json({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      createdAt: user.createdAt,
    })
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined
    if (code === "P2002") {
      return jsonError(
        res,
        "Такой email или логин уже занят. Укажите другие значения.",
        409
      )
    }
    throw e
  }
}

export async function usersGetAdmins(req: Request, res: Response) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "desc" },
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
  return res.json(admins)
}
