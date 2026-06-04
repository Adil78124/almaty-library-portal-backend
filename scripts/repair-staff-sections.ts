import { prisma } from "../src/prisma.js"

const DEFAULT_SECTION_ID = "staff-section-district-leaders"
const DEFAULT_TITLE_RU = "Руководители районных библиотек"
const DEFAULT_TITLE_KZ = "Аудандық кітапханалар директорлары"

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StaffSection" (
      "id" TEXT NOT NULL,
      "titleRu" TEXT NOT NULL,
      "titleKz" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StaffSection_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(`
    INSERT INTO "StaffSection" ("id", "titleRu", "titleKz", "sortOrder")
    VALUES ($1, $2, $3, 0)
    ON CONFLICT ("id") DO UPDATE
      SET "titleRu" = EXCLUDED."titleRu",
          "titleKz" = EXCLUDED."titleKz";
  `, DEFAULT_SECTION_ID, DEFAULT_TITLE_RU, DEFAULT_TITLE_KZ)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Staff"
      ADD COLUMN IF NOT EXISTS "email" TEXT;
  `)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Staff"
      ADD COLUMN IF NOT EXISTS "sectionId" TEXT;
  `)

  await prisma.$executeRawUnsafe(`
    UPDATE "Staff"
    SET "sectionId" = $1
    WHERE "sectionId" IS NULL;
  `, DEFAULT_SECTION_ID)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Staff"
      ALTER COLUMN "sectionId" SET NOT NULL;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Staff_sectionId_idx" ON "Staff"("sectionId");
  `)

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Staff_sectionId_fkey'
      ) THEN
        ALTER TABLE "Staff"
          ADD CONSTRAINT "Staff_sectionId_fkey"
          FOREIGN KEY ("sectionId")
          REFERENCES "StaffSection"("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE;
      END IF;
    END $$;
  `)

  const sections = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "StaffSection";`
  )
  const staff = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Staff" WHERE "sectionId" = $1;`,
    DEFAULT_SECTION_ID
  )

  console.log(
    `[staff-sections] ok: sections=${String(sections[0]?.count ?? 0)}, defaultStaff=${String(staff[0]?.count ?? 0)}`
  )
}

main()
  .catch((e) => {
    console.error("[staff-sections] failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
