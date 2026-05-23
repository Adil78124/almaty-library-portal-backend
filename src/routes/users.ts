import { Router } from "express"

import {
  usersCreateAdmin,
  usersGetAdmins,
  usersGetMe,
  usersList,
  usersPatchMe,
} from "../controllers/users-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const usersRouter = Router()

usersRouter.get("/me", (req, res, next) => {
  void usersGetMe(req, res).catch(next)
})
usersRouter.get("/", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void usersList(req, res).catch(next)
})
usersRouter.get("/admins", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void usersGetAdmins(req, res).catch(next)
})
usersRouter.patch("/me", (req, res, next) => {
  void usersPatchMe(req, res).catch(next)
})
usersRouter.post("/admin", requireRole(["SUPER_ADMIN"]), usersCreateAdmin)
