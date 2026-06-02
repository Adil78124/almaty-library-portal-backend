CREATE TYPE "HomePublishStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "NewsArticle"
  ADD COLUMN "showOnHomeRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "homePublishStatus" "HomePublishStatus",
  ADD COLUMN "homePublishRequestedAt" TIMESTAMP(3),
  ADD COLUMN "homePublishReviewedAt" TIMESTAMP(3),
  ADD COLUMN "homePublishReviewedBy" TEXT,
  ADD COLUMN "homePublishRejectReason" TEXT;

ALTER TABLE "Event"
  ADD COLUMN "showOnHomeRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "homePublishStatus" "HomePublishStatus",
  ADD COLUMN "homePublishRequestedAt" TIMESTAMP(3),
  ADD COLUMN "homePublishReviewedAt" TIMESTAMP(3),
  ADD COLUMN "homePublishReviewedBy" TEXT,
  ADD COLUMN "homePublishRejectReason" TEXT;

CREATE INDEX "NewsArticle_homePublishStatus_idx" ON "NewsArticle"("homePublishStatus");
CREATE INDEX "Event_homePublishStatus_idx" ON "Event"("homePublishStatus");
