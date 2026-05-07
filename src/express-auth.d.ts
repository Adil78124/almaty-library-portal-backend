import type { Role } from "@prisma/client"

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string
        email: string
        name: string
        role: Role
        branchId: string | null
      }
    }
  }
}

export {}
