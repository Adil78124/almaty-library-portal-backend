import { Router } from "express"

import { staffCreate, staffList, staffPatch } from "../controllers/staff-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const staffRouter = Router()

// Public list for the structure page
staffRouter.get("/", (req, res, next) => {
  void staffList(req, res).catch(next)
})

// Admin-only mutations
staffRouter.post("/", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffCreate(req, res).catch(next)
})

staffRouter.patch("/:id", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffPatch(req, res).catch(next)
})

