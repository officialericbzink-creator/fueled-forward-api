-- CreateTable
CREATE TABLE "user_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "struggles" JSONB NOT NULL,
    "positives" JSONB NOT NULL,
    "contextDigest" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_snapshots_userId_createdAt_idx" ON "user_snapshots"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_snapshots" ADD CONSTRAINT "user_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
