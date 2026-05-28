import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import type { Express } from "express"
import multer from "multer"

import { requireAdminJson } from "../lib/auth.js"

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_BYTES = 5 * 1024 * 1024

function uploadRootDir(): string {
  const fromEnv = process.env.UPLOAD_DIR?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv)
  }
  return path.resolve(process.cwd(), "../frontend/web/public/uploads")
}

function resolveUploadedFile(parts: string[]): string | null {
  if (!parts.length) return null
  for (const part of parts) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      part.includes("/") ||
      part.includes("\\") ||
      part.includes("\0")
    ) {
      return null
    }
  }

  const root = uploadRootDir()
  const filePath = path.resolve(root, ...parts)
  const relative = path.relative(root, filePath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null
  return filePath
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  return "jpg"
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const dir = uploadRootDir()
    await mkdir(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = extFromMime(file.mimetype)
    cb(null, `${randomUUID()}.${ext}`)
  },
})

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("INVALID_TYPE"))
    }
  },
})

export function registerUploadRoute(app: Express) {
  app.get("/uploads/*", (req, res) => {
    const raw = (req.params as Record<string, string>)["0"] ?? ""
    let parts: string[]
    try {
      parts = raw.split("/").map((part: string) => decodeURIComponent(part))
    } catch {
      res.status(404).json({ error: "Not Found" })
      return
    }
    const filePath = resolveUploadedFile(parts)
    if (!filePath) {
      res.status(404).json({ error: "Not Found" })
      return
    }

    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "Not Found" })
      }
    })
  })

  app.post(
    "/api/upload",
    (req, res, next) => {
      void (async () => {
        const admin = await requireAdminJson(req, res)
        if (!admin) return
        next()
      })().catch(next)
    },
    (req, res, next) => {
      uploadMiddleware.single("file")(req, res, (err: unknown) => {
        if (!err) {
          next()
          return
        }
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({
              error: "Файл слишком большой (максимум 5 МБ)",
            })
            return
          }
        }
        if (err instanceof Error && err.message === "INVALID_TYPE") {
          res.status(400).json({ error: "Допустимы только изображения" })
          return
        }
        next(err)
      })
    },
    (req, res) => {
      const file = req.file
      if (!file) {
        res.status(400).json({ error: "Нет файла" })
        return
      }
      res.json({ url: `/uploads/${file.filename}` })
    }
  )
}
