CREATE TYPE "CompanionVisibility" AS ENUM ('PUBLIC', 'WITHDRAWN');
ALTER TABLE "trip_companion_publication"
  ADD COLUMN "visibility" "CompanionVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "recruitmentOpen" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "managementRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "companion_management_revision_nonnegative" CHECK ("managementRevision" >= 0);
