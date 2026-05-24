import { randomBytes, scrypt } from "node:crypto"
import { promisify } from "node:util"

import { PrismaClient } from "@prisma/client"

const scryptAsync = promisify(scrypt)

async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const buf = (await scryptAsync(plain, salt, 64)) as Buffer
  return `${salt}:${buf.toString("hex")}`
}

const prisma = new PrismaClient()

const BRANCHES: { titleRu: string; type: "REGIONAL" | "CITY" | "DISTRICT" }[] = [
  { titleRu: "Алматинская областная библиотека", type: "REGIONAL" },
  { titleRu: "Городская библиотека №1", type: "CITY" },
  { titleRu: "Городская библиотека №2", type: "CITY" },
  ...Array.from({ length: 9 }, (_, i) => ({
    titleRu: `Районная библиотека №${i + 1}`,
    type: "DISTRICT" as const,
  })),
]

/** Переопределите в .env при выдаче заказчику. */
const SUPER_LOGIN =
  process.env.SEED_SUPERADMIN_LOGIN?.trim() || "oblkitap-portal"
const SUPER_EMAIL =
  process.env.SEED_SUPERADMIN_EMAIL?.trim() || "portal@oblkitap.kz"
const SUPER_PASSWORD =
  process.env.SEED_SUPERADMIN_PASSWORD || "OblKitap.Portal-2026"
const SUPER_NAME =
  process.env.SEED_SUPERADMIN_NAME?.trim() || "Администратор портала"

async function main() {
  for (const b of BRANCHES) {
    const found = await prisma.branch.findFirst({ where: { titleRu: b.titleRu } })
    if (!found) {
      await prisma.branch.create({ data: { titleRu: b.titleRu, type: b.type, descriptionRu: "" } })
    }
  }

  await prisma.user.deleteMany({})
  const passwordHash = await hashPassword(SUPER_PASSWORD)
  await prisma.user.create({
    data: {
      login: SUPER_LOGIN,
      email: SUPER_EMAIL.toLowerCase(),
      password: passwordHash,
      name: SUPER_NAME,
      role: "SUPER_ADMIN",
      branchId: null,
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
