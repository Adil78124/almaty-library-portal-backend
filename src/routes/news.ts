import { Router } from "express"

import {
  newsCreate,
  newsDelete,
  newsGetById,
  newsList,
  newsUpdate,
} from "../controllers/news-controller.js"

export const newsRouter = Router()

newsRouter.get("/", (req, res, next) => {
  void newsList(req, res).catch(next)
})
newsRouter.post("/", (req, res, next) => {
  void newsCreate(req, res).catch(next)
})
newsRouter.get("/:id", (req, res, next) => {
  void newsGetById(req, res).catch(next)
})
newsRouter.put("/:id", (req, res, next) => {
  void newsUpdate(req, res).catch(next)
})
newsRouter.patch("/:id", (req, res, next) => {
  void newsUpdate(req, res).catch(next)
})
newsRouter.delete("/:id", (req, res, next) => {
  void newsDelete(req, res).catch(next)
})
