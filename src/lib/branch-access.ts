import type { Role } from "@prisma/client"

export type BranchAccessUser = {
  role: Role
  branchId: string | null
}

export function checkBranchAccess(
  user: BranchAccessUser,
  branchId: string
): void {
  if (user.role === "SUPER_ADMIN") return
  if (user.role === "ADMIN" && user.branchId === branchId) return
  throw new Error("Forbidden")
}
