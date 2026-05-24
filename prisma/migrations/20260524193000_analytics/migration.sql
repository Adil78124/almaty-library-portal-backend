CREATE TABLE "PageVisit" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pageTitle" TEXT,
    "section" TEXT,
    "branchId" TEXT,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitorActivity" (
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "path" TEXT,
    "branchId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorActivity_pkey" PRIMARY KEY ("visitorId")
);

CREATE INDEX "PageVisit_createdAt_idx" ON "PageVisit"("createdAt");
CREATE INDEX "PageVisit_path_createdAt_idx" ON "PageVisit"("path", "createdAt");
CREATE INDEX "PageVisit_section_createdAt_idx" ON "PageVisit"("section", "createdAt");
CREATE INDEX "PageVisit_branchId_createdAt_idx" ON "PageVisit"("branchId", "createdAt");
CREATE INDEX "PageVisit_visitorId_createdAt_idx" ON "PageVisit"("visitorId", "createdAt");
CREATE INDEX "VisitorActivity_lastSeenAt_idx" ON "VisitorActivity"("lastSeenAt");
CREATE INDEX "VisitorActivity_branchId_lastSeenAt_idx" ON "VisitorActivity"("branchId", "lastSeenAt");

ALTER TABLE "PageVisit" ADD CONSTRAINT "PageVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitorActivity" ADD CONSTRAINT "VisitorActivity_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
