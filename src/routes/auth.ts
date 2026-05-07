import { Router } from "express"

import { authLogin } from "../controllers/auth-controller.js"

export const authRouter = Router()

authRouter.post("/login", authLogin)
