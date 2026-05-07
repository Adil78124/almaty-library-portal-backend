import type { AdminPrincipal } from "./auth.js"

/** Доступ к материалу с привязкой к филиалу. null = сетевой уровень (только SUPER_ADMIN). */
export function assertBranchScopedResource(
  admin: AdminPrincipal,
  resourceBranchId: string | null
): void {
  if (admin.role === "SUPER_ADMIN") return
  if (admin.role !== "ADMIN" || !admin.branchId) {
    throw new Error("Forbidden")
  }
  if (resourceBranchId === null) {
    throw new Error("Forbidden")
  }
  if (resourceBranchId !== admin.branchId) {
    throw new Error("Forbidden")
  }
}
