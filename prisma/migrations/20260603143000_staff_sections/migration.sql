CREATE TABLE "StaffSection" (
  "id" TEXT NOT NULL,
  "titleRu" TEXT NOT NULL,
  "titleKz" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffSection_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StaffSection" ("id", "titleRu", "titleKz", "sortOrder")
VALUES (
  'staff-section-district-leaders',
  'Руководители районных библиотек',
  'Аудандық кітапханалар директорлары',
  0
);

ALTER TABLE "Staff"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "sectionId" TEXT;

UPDATE "Staff"
SET "sectionId" = 'staff-section-district-leaders'
WHERE "sectionId" IS NULL;

ALTER TABLE "Staff"
  ALTER COLUMN "sectionId" SET NOT NULL;

CREATE INDEX "Staff_sectionId_idx" ON "Staff"("sectionId");

ALTER TABLE "Staff"
  ADD CONSTRAINT "Staff_sectionId_fkey"
  FOREIGN KEY ("sectionId")
  REFERENCES "StaffSection"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
