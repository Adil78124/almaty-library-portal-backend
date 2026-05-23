import { Router } from "express"

import {
  branchesCreate,
  branchesDelete,
  branchesGetAdministrator,
  branchesGetById,
  branchesList,
  branchesPatchContacts,
  branchesSetAdministrator,
  branchesUpdate,
} from "../controllers/branches-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const branchesRouter = Router()

branchesRouter.get("/", branchesList)
branchesRouter.post("/", requireRole(["SUPER_ADMIN"]), branchesCreate)
branchesRouter.patch(
  "/:id/contacts",
  requireRole(["SUPER_ADMIN", "ADMIN"]),
  (req, res, next) => {
    void branchesPatchContacts(req, res).catch(next)
  }
)
branchesRouter.get(
  "/:id/administrator",
  requireRole(["SUPER_ADMIN"]),
  (req, res, next) => {
    void branchesGetAdministrator(req, res).catch(next)
  }
)
branchesRouter.patch(
  "/:id/administrator",
  requireRole(["SUPER_ADMIN"]),
  (req, res, next) => {
    void branchesSetAdministrator(req, res).catch(next)
  }
)
branchesRouter.patch("/:id", requireRole(["SUPER_ADMIN"]), branchesUpdate)
branchesRouter.delete("/:id", requireRole(["SUPER_ADMIN"]), branchesDelete)
branchesRouter.get("/:id", branchesGetById)
