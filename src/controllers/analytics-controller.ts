import crypto from "node:crypto"
import fs from "node:fs"

import type { Request, Response } from "express"
import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
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

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "7 дней",
  "30d": "30 дней",
  "3m": "3 месяца",
}

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

function reportDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function generatedAt(): string {
  return new Date().toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  })
}

function styleWorksheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: "FF111827" } }
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  }
  header.alignment = { vertical: "middle" }

  sheet.columns.forEach((column) => {
    let maxLength = 12
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const raw = cell.value
      const value =
        raw === null || raw === undefined
          ? ""
          : typeof raw === "object"
            ? JSON.stringify(raw)
            : String(raw)
      maxLength = Math.max(maxLength, value.length)
    })
    column.width = Math.min(Math.max(maxLength + 2, 12), 48)
  })
}

function resolvePdfFontPath(): string | null {
  const candidates = [
    process.env.PDF_FONT_PATH,
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\calibri.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function registerPdfFont(doc: jsPDF): string {
  const fontPath = resolvePdfFontPath()
  if (!fontPath) return "helvetica"

  const fontName = "AnalyticsFont"
  const fontFile = "analytics-font.ttf"
  const font = fs.readFileSync(fontPath).toString("base64")
  doc.addFileToVFS(fontFile, font)
  doc.addFont(fontFile, fontName, "normal")
  doc.setFont(fontName, "normal")
  return fontName
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
  const branch = scope.branchId
    ? await prisma.branch.findUnique({
        where: { id: scope.branchId },
        select: { id: true, titleRu: true },
      })
    : null

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
    scope: scope.branchId ? "branch" : "site",
    branchId: scope.branchId ?? null,
    branchName: branch?.titleRu ?? null,
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
  const date = reportDate()
  const generationDate = generatedAt()
  const [summary, pages, branches] = await Promise.all([
    getSummaryData(period, scope),
    getPagesData(period, scope),
    getBranchesData(period, scope),
  ])

  if (format === "pdf") {
    const doc = new jsPDF({ format: "a4", unit: "pt" })
    const font = registerPdfFont(doc)
    const tableStyles = {
      font,
      fontStyle: "normal" as const,
      fontSize: 9,
      cellPadding: 5,
      textColor: [17, 24, 39] as [number, number, number],
      lineColor: [229, 231, 235] as [number, number, number],
      lineWidth: 0.5,
    }
    const headStyles = {
      font,
      fontStyle: "normal" as const,
      fillColor: [229, 231, 235] as [number, number, number],
      textColor: [17, 24, 39] as [number, number, number],
    }

    doc.setFont(font, "normal")
    doc.setFontSize(18)
    doc.text("Отчёт по посещаемости сайта", 40, 48)
    doc.setFontSize(10)
    doc.text(`Период: ${PERIOD_LABEL[period]}`, 40, 72)
    doc.text(`Дата формирования: ${generationDate}`, 40, 88)
    if (summary.scope === "branch") {
      doc.text(`Филиал: ${summary.branchName ?? "не указан"}`, 40, 104)
    }

    autoTable(doc, {
      startY: summary.scope === "branch" ? 124 : 108,
      head: [["Показатель", "Значение"]],
      body: [
        ["Всего посещений", summary.totalVisits],
        ["Просмотры страниц", summary.pageViews],
        ["Уникальные посетители", summary.uniqueVisitors],
        ["Сейчас на сайте", summary.online],
      ],
      styles: tableStyles,
      headStyles,
      theme: "grid",
    })

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 24,
      head: [["Страница", "Раздел", "Просмотры", "Уникальные посетители"]],
      body: pages.length
        ? pages.map((row) => [row.path, row.section ?? "-", row.visits, row.uniqueVisitors])
        : [["Нет данных за выбранный период", "-", "-", "-"]],
      styles: tableStyles,
      headStyles,
      theme: "grid",
    })

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 24,
      head: [["Филиал", "Просмотры", "Уникальные посетители"]],
      body: branches.length
        ? branches.map((row) => [row.titleRu, row.visits, row.uniqueVisitors])
        : [["Нет данных за выбранный период", "-", "-"]],
      styles: tableStyles,
      headStyles,
      theme: "grid",
    })

    const body = Buffer.from(doc.output("arraybuffer"))
    res.setHeader("content-type", "application/pdf")
    res.setHeader("content-disposition", `attachment; filename="analytics-report-${period}-${date}.pdf"`)
    return res.send(body)
  }

  if (format !== "xlsx") {
    return jsonError(res, "Unsupported export format", 400)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Almaty Library Portal"
  workbook.created = new Date()

  const summarySheet = workbook.addWorksheet("Summary")
  summarySheet.columns = [
    { header: "Metric", key: "metric" },
    { header: "Value", key: "value" },
  ]
  summarySheet.addRows([
    { metric: "Период", value: PERIOD_LABEL[period] },
    { metric: "Дата формирования", value: generationDate },
    { metric: "Всего посещений", value: summary.totalVisits },
    { metric: "Просмотры страниц", value: summary.pageViews },
    { metric: "Уникальные посетители", value: summary.uniqueVisitors },
    { metric: "Сейчас на сайте", value: summary.online },
    ...(summary.scope === "branch" ? [{ metric: "Филиал", value: summary.branchName ?? "не указан" }] : []),
  ])
  styleWorksheet(summarySheet)

  const pagesSheet = workbook.addWorksheet("Pages")
  pagesSheet.columns = [
    { header: "Page path", key: "path" },
    { header: "Section", key: "section" },
    { header: "Visits", key: "visits" },
    { header: "Unique visitors", key: "uniqueVisitors" },
  ]
  pagesSheet.addRows(
    pages.map((row) => ({
      path: row.path,
      section: row.section ?? "-",
      visits: row.visits,
      uniqueVisitors: row.uniqueVisitors,
    }))
  )
  styleWorksheet(pagesSheet)

  const branchesSheet = workbook.addWorksheet("Branches")
  branchesSheet.columns = [
    { header: "Branch name", key: "branchName" },
    { header: "Visits", key: "visits" },
    { header: "Unique visitors", key: "uniqueVisitors" },
  ]
  branchesSheet.addRows(
    branches.map((row) => ({
      branchName: row.titleRu,
      visits: row.visits,
      uniqueVisitors: row.uniqueVisitors,
    }))
  )
  styleWorksheet(branchesSheet)

  const body = Buffer.from(await workbook.xlsx.writeBuffer())
  res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res.setHeader("content-disposition", `attachment; filename="analytics-report-${period}-${date}.xlsx"`)
  return res.send(body)
}
