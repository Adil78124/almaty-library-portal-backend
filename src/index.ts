import "dotenv/config"

import cookieParser from "cookie-parser"
import express from "express"

import { authRouter } from "./routes/auth.js"
import { branchesRouter } from "./routes/branches.js"
import { eventsRouter } from "./routes/events.js"
import { newsRouter } from "./routes/news.js"
import { registerUploadRoute } from "./routes/upload.js"
import { siteSettingsRouter } from "./routes/site-settings.js"
import { usersRouter } from "./routes/users.js"
import { staffRouter } from "./routes/staff.js"
import { pagesRouter } from "./routes/pages.js"
import { prisma } from "./prisma.js"

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "DATABASE_URL is not set. Create backend/.env from env.template (shared SQLite with frontend/web/prisma/dev.db)."
  )
}

const secret = process.env.SESSION_SECRET?.trim() ?? ""
if (secret.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters in production."
    )
  }
  console.warn(
    "[api] SESSION_SECRET is missing or shorter than 32 chars — copy the same value as in frontend/web/.env for admin login."
  )
}

const app = express()
app.disable("x-powered-by")
app.use(cookieParser())
app.use(express.json({ limit: "4mb" }))

app.use("/auth", authRouter)
app.use("/users", usersRouter)
app.use("/branches", branchesRouter)
app.use("/api/news", newsRouter)
app.use("/api/events", eventsRouter)
app.use("/api/site-settings", siteSettingsRouter)
registerUploadRoute(app)
app.use("/staff", staffRouter)
app.use("/pages", pagesRouter)

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" })
})

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err)
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" })
    }
  }
)

async function start() {
  try {
    await prisma.$connect()
  } catch (e) {
    console.error("[api] Prisma connection failed:", e)
    process.exit(1)
  }

  const port = Number(process.env.PORT) || 4000
  const server = app.listen(port)

  function shutdown() {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0))
    })
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

void start()
