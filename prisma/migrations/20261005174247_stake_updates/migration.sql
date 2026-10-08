-- Bet becomes one updatable stake per (pool, address): enum gains WITHDRAWN
-- and PoolStatus gains CANCELLED for the new contract, the Bet unique key moves
-- from per-event (txHash, logIndex) to per-bettor (poolId, address), and the
-- vestigial per-pool rake column is dropped (rake is global on-chain now).

-- AlterEnum
ALTER TYPE "BetStatus" ADD VALUE 'WITHDRAWN';

-- AlterEnum
ALTER TYPE "PoolStatus" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Bet_poolId_idx";

-- DropIndex
DROP INDEX "Bet_txHash_logIndex_key";

-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "claimed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pool" DROP COLUMN "rakeBps";

-- CreateIndex
CREATE UNIQUE INDEX "Bet_poolId_address_key" ON "Bet"("poolId", "address");
