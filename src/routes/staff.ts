import { Router } from "express"

import {
  staffCreate,
  staffDelete,
  staffList,
  staffPatch,
  staffSectionCreate,
  staffSectionDelete,
  staffSectionList,
  staffSectionPatch,
} from "../controllers/staff-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const staffRouter = Router()

// Public list for the structure page
staffRouter.get("/", (req, res, next) => {
  void staffList(req, res).catch(next)
})

staffRouter.get("/sections", (req, res, next) => {
  void staffSectionList(req, res).catch(next)
})

staffRouter.post("/sections", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffSectionCreate(req, res).catch(next)
})

staffRouter.patch("/sections/:id", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffSectionPatch(req, res).catch(next)
})

staffRouter.delete("/sections/:id", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffSectionDelete(req, res).catch(next)
})

// Admin-only mutations
staffRouter.post("/", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffCreate(req, res).catch(next)
})

staffRouter.patch("/:id", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffPatch(req, res).catch(next)
})

staffRouter.delete("/:id", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void staffDelete(req, res).catch(next)
})

