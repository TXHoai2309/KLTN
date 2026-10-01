-- Stores completed write results so retries can return the original outcome.
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_record_scope_key_key"
    ON "idempotency_record"("scope", "key");
