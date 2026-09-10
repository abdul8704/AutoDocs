/*
  Warnings:

  - Made the column `inputTokens` on table `LLMLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `outputTokens` on table `LLMLog` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "LLMLog" ADD COLUMN     "cacheStorageCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "cachedTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promptTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokenCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ALTER COLUMN "inputTokens" SET NOT NULL,
ALTER COLUMN "outputTokens" SET NOT NULL;

-- AlterTable
ALTER TABLE "ModelRoster" ADD COLUMN     "cachedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "inputPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "outputPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
