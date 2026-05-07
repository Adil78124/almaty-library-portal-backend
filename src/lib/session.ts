import { jwtVerify, SignJWT } from "jose"
import type { Role } from "@prisma/client"

const COOKIE_NAME = "admin_session"

function getSecretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) {
    return new TextEncoder().encode(s)
  }
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("dev-only-secret-min-32-chars!!")
  }
  throw new Error(
    "Задайте SESSION_SECRET (не короче 32 символов) в переменных окружения."
  )
}

export type JwtPayload = {
  email: string
  sub?: string
  role?: Role
  branchId?: string | null
  name?: string
}

/** Cookie-сессия (как у Next): минимум email; роль подтягивается из User при verify на сервере. */
export async function createAdminSessionToken(email: string): Promise<string> {
  const key = getSecretKey()
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key)
}

/** Ответ POST /auth/login — полный набор полей в JWT. */
export async function createAuthToken(p: {
  id: string
  email: string
  name: string
  role: Role
  branchId: string | null
}): Promise<string> {
  const key = getSecretKey()
  return new SignJWT({
    email: p.email,
    sub: p.id,
    role: p.role,
    branchId: p.branchId,
    name: p.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key)
}

export async function verifyAdminSessionToken(
  token: string
): Promise<JwtPayload | null> {
  let key: Uint8Array
  try {
    key = getSecretKey()
  } catch {
    return null
  }
  try {
    const { payload } = await jwtVerify(token, key)
    const emailRaw =
      typeof payload.email === "string" ? payload.email : payload.sub
    if (!emailRaw || typeof emailRaw !== "string") {
      return null
    }
    const email = emailRaw
    const sub = typeof payload.sub === "string" ? payload.sub : undefined
    const role = payload.role as Role | undefined
    const br = payload.branchId
    const branchId =
      br === null ? null : typeof br === "string" ? br : undefined
    const name = typeof payload.name === "string" ? payload.name : undefined
    return { email, sub, role, branchId, name }
  } catch {
    return null
  }
}

export const ADMIN_SESSION_COOKIE = COOKIE_NAME
