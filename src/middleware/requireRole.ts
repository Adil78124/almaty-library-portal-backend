import type { NextFunction, Request, Response } from "express"
import type { Role } from "@prisma/client"

import { getOptionalAdmin } from "../lib/auth.js"
import { jsonError } from "../lib/http.js"

export function requireRole(allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const admin = await getOptionalAdmin(req)
    if (!admin) {
      return jsonError(res, "Требуется вход", 401)
    }
    if (!allowed.includes(admin.role)) {
      return jsonError(res, "Forbidden", 403)
    }
    req.admin = admin
    next()
  }
}
