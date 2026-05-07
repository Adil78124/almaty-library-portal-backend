import { Router } from "express"

import {
  siteSettingsGet,
  siteSettingsPatch,
  siteSettingsPut,
} from "../controllers/site-settings-controller.js"
import { requireRole } from "../middleware/requireRole.js"

export const siteSettingsRouter = Router()

siteSettingsRouter.get("/", (req, res, next) => {
  void siteSettingsGet(req, res).catch(next)
})
siteSettingsRouter.put("/", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void siteSettingsPut(req, res).catch(next)
})
siteSettingsRouter.patch("/", requireRole(["SUPER_ADMIN"]), (req, res, next) => {
  void siteSettingsPatch(req, res).catch(next)
})
