import type { Response } from "express"
import type { ZodError } from "zod"

export function jsonError(res: Response, message: string, status: number) {
  return res.status(status).json({ error: message })
}

export function jsonValidationError(res: Response, error: ZodError) {
  return res.status(400).json({
    error: "Ошибка валидации",
    issues: error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  })
}
