import type { Request, Response } from "express"
import type { Role } from "@prisma/client"

import { prisma } from "../prisma.js"
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
  type JwtPayload,
} from "./session.js"

export type AdminPrincipal = {
  id: string
  email: string
  name: string
  role: Role
  branchId: string | null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function principalFromDb(
  email: string
): Promise<AdminPrincipal | null> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  }
}

/** Legacy: JWT от Next (только email), записи User ещё нет — полный доступ как SUPER_ADMIN. */
function legacyPrincipal(email: string, jwtSub?: string): AdminPrincipal {
  return {
    id: jwtSub && jwtSub !== email ? jwtSub : "legacy",
    email: normalizeEmail(email),
    name: "Администратор",
    role: "SUPER_ADMIN",
    branchId: null,
  }
}

function principalFromJwtPayload(p: JwtPayload): AdminPrincipal | null {
  if (p.role !== "ADMIN" && p.role !== "SUPER_ADMIN") return null
  return {
    id: p.sub ?? "unknown",
    email: normalizeEmail(p.email),
    name: p.name ?? "Администратор",
    role: p.role,
    branchId: p.branchId ?? null,
  }
}

function bearerToken(req: Request): string | null {
  const h = req.headers.authorization
  if (!h || typeof h !== "string") return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

export async function getOptionalAdmin(
  req: Request
): Promise<AdminPrincipal | null> {
  const token =
    bearerToken(req) ?? req.cookies[ADMIN_SESSION_COOKIE] ?? null
  if (!token) {
    return null
  }
  const payload = await verifyAdminSessionToken(token)
  if (!payload?.email) {
    return null
  }
  const fromDb = await principalFromDb(payload.email)
  if (fromDb) {
    return fromDb
  }
  const fromJwt = principalFromJwtPayload(payload)
  if (fromJwt) {
    return fromJwt
  }
  return legacyPrincipal(payload.email, payload.sub)
}

export async function requireAdminJson(
  req: Request,
  res: Response
): Promise<AdminPrincipal | null> {
  const admin = await getOptionalAdmin(req)
  if (!admin) {
    res.status(401).json({ error: "Требуется вход" })
    return null
  }
  return admin
}
