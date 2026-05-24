import { Router } from "express"

import {
  analyticsBranches,
  analyticsExport,
  analyticsHeartbeat,
  analyticsPages,
  analyticsPublicStats,
  analyticsRecordVisit,
  analyticsSummary,
} from "../controllers/analytics-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const analyticsRouter = Router()
export const analyticsAdminRouter = Router()

analyticsRouter.post("/visit", (req, res, next) => {
  void analyticsRecordVisit(req, res).catch(next)
})

analyticsRouter.post("/heartbeat", (req, res, next) => {
  void analyticsHeartbeat(req, res).catch(next)
})

analyticsRouter.get("/public", (req, res, next) => {
  void analyticsPublicStats(req, res).catch(next)
})

analyticsAdminRouter.get("/summary", requireRole(["SUPER_ADMIN", "ADMIN"]), (req, res, next) => {
  void analyticsSummary(req, res).catch(next)
})

analyticsAdminRouter.get("/pages", requireRole(["SUPER_ADMIN", "ADMIN"]), (req, res, next) => {
  void analyticsPages(req, res).catch(next)
})

analyticsAdminRouter.get("/branches", requireRole(["SUPER_ADMIN", "ADMIN"]), (req, res, next) => {
  void analyticsBranches(req, res).catch(next)
})

analyticsAdminRouter.get("/export", requireRole(["SUPER_ADMIN", "ADMIN"]), (req, res, next) => {
  void analyticsExport(req, res).catch(next)
})
