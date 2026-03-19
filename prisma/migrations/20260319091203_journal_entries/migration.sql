-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_entries_userId_createdAt_idx" ON "journal_entries"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
