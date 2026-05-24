import crypto from "node:crypto"

import type { Request, Response } from "express"
import PDFDocument from "pdfkit"
import * as XLSX from "xlsx"
import { z } from "zod"

import { jsonError, jsonValidationError } from "../lib/http.js"
import { prisma } from "../prisma.js"

const PERIOD_DAYS = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
} as const

type Period = keyof typeof PERIOD_DAYS
type AdminScope = { branchId?: string | null }

const visitSchema = z.object({
  path: z.string().min(1).max(500),
  pageTitle: z.string().max(300).nullable().optional(),
  section: z.string().max(80).nullable().optional(),
  branchId: z.string().max(100).nullable().optional(),
  visitorId: z.string().min(8).max(120),
  sessionId: z.string().max(120).nullable().optional(),
  referrer: z.string().max(1000).nullable().optional(),
})

function getPeriod(req: Request): Period {
  const raw = typeof req.query.period === "string" ? req.query.period : "30d"
  return raw === "7d" || raw === "3m" ? raw : "30d"
}

function periodStart(period: Period): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - (PERIOD_DAYS[period] - 1))
  return d
}

function onlineSince(): Date {
  return new Date(Date.now() - 2 * 60 * 1000)
}

function scopeWhere(scope: AdminScope) {
  return scope.branchId ? { branchId: scope.branchId } : {}
}

function adminScope(req: Request): AdminScope {
  const admin = req.admin
  if (!admin || admin.role === "SUPER_ADMIN") return {}
  return { branchId: admin.branchId ?? "__none__" }
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return (first?.split(",")[0]?.trim() || req.socket.remoteAddress || "").trim()
}

function hashIp(ip: string): string | null {
  if (!ip) return null
  const salt = process.env.ANALYTICS_SALT || process.env.SESSION_SECRET || "analytics-dev-salt"
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex")
}

function normalizePath(path: string): string {
  const p = path.trim()
  if (!p.startsWith("/")) return `/${p}`
  return p.split("#")[0]?.slice(0, 500) || "/"
}

function inferSection(path: string, explicit?: string | null): string {
  if (explicit) return explicit
  if (path === "/") return "home"
  const first = path.split("?")[0]?.split("/").filter(Boolean)[0]
  return first || "home"
}

function inferBranchId(path: string, explicit?: string | null): string | null {
  if (explicit) return explicit
  const m = /^\/branches\/([^/?#]+)/.exec(path)
  return m?.[1] ?? null
}

async function branchExists(id: string | null): Promise<string | null> {
  if (!id) return null
  const row = await prisma.branch.findUnique({ where: { id }, select: { id: true } })
  return row?.id ?? null
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDateForExport(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  return d.toLocaleDateString("ru-RU", { timeZone: "UTC" })
}

async function getSummaryData(period: Period, scope: AdminScope) {
  const start = periodStart(period)
  const baseWhere = {
    createdAt: { gte: start },
    ...scopeWhere(scope),
  }
  const [pageViews, uniqueVisitors, online, visits] = await Promise.all([
    prisma.pageVisit.count({ where: baseWhere }),
    prisma.pageVisit.findMany({
      where: baseWhere,
      select: { visitorId: true },
      distinct: ["visitorId"],
    }),
    prisma.visitorActivity.count({
      where: { lastSeenAt: { gte: onlineSince() }, ...scopeWhere(scope) },
    }),
    prisma.pageVisit.findMany({
      where: baseWhere,
      select: { createdAt: true, visitorId: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const days = new Map<string, { date: string; visits: number; visitors: Set<string> }>()
  for (let i = 0; i < PERIOD_DAYS[period]; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = dayKey(d)
    days.set(key, { date: key, visits: 0, visitors: new Set<string>() })
  }
  for (const visit of visits) {
    const key = dayKey(visit.createdAt)
    const row = days.get(key)
    if (!row) continue
    row.visits += 1
    row.visitors.add(visit.visitorId)
  }

  return {
    period,
    from: start.toISOString(),
    to: new Date().toISOString(),
    totalVisits: pageViews,
    pageViews,
    uniqueVisitors: uniqueVisitors.length,
    online,
    series: [...days.values()].map((row) => ({
      date: row.date,
      visits: row.visits,
      uniqueVisitors: row.visitors.size,
    })),
  }
}

async function getPagesData(period: Period, scope: AdminScope) {
  const rows = await prisma.pageVisit.findMany({
    where: { createdAt: { gte: periodStart(period) }, ...scopeWhere(scope) },
    select: { path: true, section: true, visitorId: true },
  })
  const byPath = new Map<string, { path: string; section: string | null; visits: number; visitors: Set<string> }>()
  for (const row of rows) {
    const key = row.path
    const item = byPath.get(key) ?? {
      path: key,
      section: row.section,
      visits: 0,
      visitors: new Set<string>(),
    }
    item.visits += 1
    item.visitors.add(row.visitorId)
    if (!item.section && row.section) item.section = row.section
    byPath.set(key, item)
  }
  return [...byPath.values()]
    .map((row) => ({
      path: row.path,
      section: row.section,
      visits: row.visits,
      uniqueVisitors: row.visitors.size,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 50)
}

async function getBranchesData(period: Period, scope: AdminScope) {
  const rows = await prisma.pageVisit.findMany({
    where: {
      createdAt: { gte: periodStart(period) },
      branchId: scope.branchId ? scope.branchId : { not: null },
    },
    select: { branchId: true, visitorId: true },
  })
  const ids = [...new Set(rows.map((r) => r.branchId).filter(Boolean))] as string[]
  const branches = await prisma.branch.findMany({
    where: { id: { in: ids } },
    select: { id: true, titleRu: true, titleKz: true },
  })
  const branchMap = new Map(branches.map((b) => [b.id, b]))
  const byBranch = new Map<string, { branchId: string; visits: number; visitors: Set<string> }>()
  for (const row of rows) {
    if (!row.branchId) continue
    const item = byBranch.get(row.branchId) ?? {
      branchId: row.branchId,
      visits: 0,
      visitors: new Set<string>(),
    }
    item.visits += 1
    item.visitors.add(row.visitorId)
    byBranch.set(row.branchId, item)
  }
  return [...byBranch.values()]
    .map((row) => {
      const branch = branchMap.get(row.branchId)
      return {
        branchId: row.branchId,
        titleRu: branch?.titleRu ?? row.branchId,
        titleKz: branch?.titleKz ?? null,
        visits: row.visits,
        uniqueVisitors: row.visitors.size,
      }
    })
    .sort((a, b) => b.visits - a.visits)
}

export async function analyticsRecordVisit(req: Request, res: Response) {
  const parsed = visitSchema.safeParse(req.body)
  if (!parsed.success) return jsonValidationError(res, parsed.error)

  const path = normalizePath(parsed.data.path)
  if (path.startsWith("/admin") || path.startsWith("/login") || path.startsWith("/api")) {
    return res.status(204).send()
  }

  const branchId = await branchExists(inferBranchId(path, parsed.data.branchId))
  const section = inferSection(path, parsed.data.section)
  const now = new Date()
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500) || null
  const referrer =
    parsed.data.referrer?.trim() ||
    (typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 1000) : null)

  await prisma.$transaction([
    prisma.pageVisit.create({
      data: {
        path,
        pageTitle: parsed.data.pageTitle?.trim() || null,
        section,
        branchId,
        visitorId: parsed.data.visitorId,
        sessionId: parsed.data.sessionId ?? null,
        ipHash: hashIp(clientIp(req)),
        userAgent,
        referrer,
        createdAt: now,
      },
    }),
    prisma.visitorActivity.upsert({
      where: { visitorId: parsed.data.visitorId },
      create: {
        visitorId: parsed.data.visitorId,
        sessionId: parsed.data.sessionId ?? null,
        path,
        branchId,
        lastSeenAt: now,
      },
      update: {
        sessionId: parsed.data.sessionId ?? null,
        path,
        branchId,
        lastSeenAt: now,
      },
    }),
  ])

  return res.status(204).send()
}

export async function analyticsHeartbeat(req: Request, res: Response) {
  const parsed = visitSchema.pick({ path: true, visitorId: true, sessionId: true, branchId: true }).safeParse(req.body)
  if (!parsed.success) return jsonValidationError(res, parsed.error)
  const path = normalizePath(parsed.data.path)
  const branchId = await branchExists(inferBranchId(path, parsed.data.branchId))
  await prisma.visitorActivity.upsert({
    where: { visitorId: parsed.data.visitorId },
    create: {
      visitorId: parsed.data.visitorId,
      sessionId: parsed.data.sessionId ?? null,
      path,
      branchId,
      lastSeenAt: new Date(),
    },
    update: {
      sessionId: parsed.data.sessionId ?? null,
      path,
      branchId,
      lastSeenAt: new Date(),
    },
  })
  return res.status(204).send()
}

export async function analyticsPublicStats(_req: Request, res: Response) {
  const [online, totalVisits] = await Promise.all([
    prisma.visitorActivity.count({ where: { lastSeenAt: { gte: onlineSince() } } }),
    prisma.pageVisit.count(),
  ])
  return res.json({ online, totalVisits })
}

export async function analyticsSummary(req: Request, res: Response) {
  return res.json(await getSummaryData(getPeriod(req), adminScope(req)))
}

export async function analyticsPages(req: Request, res: Response) {
  return res.json(await getPagesData(getPeriod(req), adminScope(req)))
}

export async function analyticsBranches(req: Request, res: Response) {
  return res.json(await getBranchesData(getPeriod(req), adminScope(req)))
}

export async function analyticsExport(req: Request, res: Response) {
  const period = getPeriod(req)
  const scope = adminScope(req)
  const format = typeof req.query.format === "string" ? req.query.format : "xlsx"
  const [summary, pages, branches] = await Promise.all([
    getSummaryData(period, scope),
    getPagesData(period, scope),
    getBranchesData(period, scope),
  ])

  if (format === "pdf") {
    const doc = new PDFDocument({ margin: 40, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => {
      const body = Buffer.concat(chunks)
      res.setHeader("content-type", "application/pdf")
      res.setHeader("content-disposition", `attachment; filename="analytics-${period}.pdf"`)
      res.send(body)
    })
    doc.fontSize(18).text("Analytics report", { underline: true })
    doc.moveDown()
    doc.fontSize(11).text(`Period: ${period}`)
    doc.text(`Visits: ${summary.pageViews}`)
    doc.text(`Unique visitors: ${summary.uniqueVisitors}`)
    doc.text(`Currently online: ${summary.online}`)
    doc.moveDown()
    doc.fontSize(14).text("Top pages")
    for (const row of pages.slice(0, 25)) {
      doc.fontSize(9).text(`${row.path} | ${row.section ?? "-"} | visits: ${row.visits} | unique: ${row.uniqueVisitors}`)
    }
    doc.moveDown()
    doc.fontSize(14).text("Branches")
    for (const row of branches.slice(0, 25)) {
      doc.fontSize(9).text(`${row.titleRu} | visits: ${row.visits} | unique: ${row.uniqueVisitors}`)
    }
    doc.end()
    return
  }

  if (format !== "xlsx") {
    return jsonError(res, "Unsupported export format", 400)
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { metric: "period", value: period },
      { metric: "from", value: summary.from },
      { metric: "to", value: summary.to },
      { metric: "pageViews", value: summary.pageViews },
      { metric: "uniqueVisitors", value: summary.uniqueVisitors },
      { metric: "online", value: summary.online },
    ]),
    "Summary"
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summary.series.map((row) => ({ ...row, date: formatDateForExport(row.date) }))),
    "Daily"
  )
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pages), "Pages")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(branches), "Branches")
  const body = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer
  res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res.setHeader("content-disposition", `attachment; filename="analytics-${period}.xlsx"`)
  return res.send(body)
}
