import type { NextFunction, Request, Response } from "express"

import { getOptionalAdmin } from "../lib/auth.js"
import { jsonError } from "../lib/http.js"

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const admin = await getOptionalAdmin(req)
    if (!admin) {
      return jsonError(res, "Требуется вход", 401)
    }
    req.admin = admin
    next()
  }
}
