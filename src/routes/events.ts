import { Router } from "express"

import {
  eventsCreate,
  eventsDelete,
  eventsGetById,
  eventsList,
  eventsPatch,
} from "../controllers/events-controller.js"

export const eventsRouter = Router()

eventsRouter.get("/", (req, res, next) => {
  void eventsList(req, res).catch(next)
})
eventsRouter.post("/", (req, res, next) => {
  void eventsCreate(req, res).catch(next)
})
eventsRouter.get("/:id", (req, res, next) => {
  void eventsGetById(req, res).catch(next)
})
eventsRouter.patch("/:id", (req, res, next) => {
  void eventsPatch(req, res).catch(next)
})
eventsRouter.delete("/:id", (req, res, next) => {
  void eventsDelete(req, res).catch(next)
})
