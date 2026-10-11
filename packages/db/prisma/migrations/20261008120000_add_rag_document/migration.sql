CREATE TYPE "RagDocumentStatus" AS ENUM ('UPLOADED', 'REVIEWING', 'APPROVED', 'INDEXED', 'DISABLED');
CREATE TYPE "RagDocumentFileType" AS ENUM ('PDF', 'DOCX', 'TXT');

CREATE TABLE "rag_document" (
    "id" TEXT NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "fileType" "RagDocumentFileType" NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "sourceTitle" VARCHAR(300) NOT NULL,
    "sourceUrl" VARCHAR(2000),
    "author" VARCHAR(200),
    "topic" VARCHAR(200),
    "locality" VARCHAR(200),
    "uploadedById" TEXT NOT NULL,
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rag_document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rag_document_storagePath_key" ON "rag_document"("storagePath");
