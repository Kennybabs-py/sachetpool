-- Token amounts are uint256-scale. Postgres `bigint` is signed 64-bit and
-- overflows past ~9.22 tokens at 18 decimals, which silently blocked bets from
-- being mirrored. Widen the money columns to numeric(78, 0) (uint256 width).

-- AlterTable
ALTER TABLE "Pool"
  ALTER COLUMN "totalStake" SET DATA TYPE DECIMAL(78,0) USING "totalStake"::DECIMAL(78,0),
  ALTER COLUMN "stakeHome" SET DATA TYPE DECIMAL(78,0) USING "stakeHome"::DECIMAL(78,0),
  ALTER COLUMN "stakeDraw" SET DATA TYPE DECIMAL(78,0) USING "stakeDraw"::DECIMAL(78,0),
  ALTER COLUMN "stakeAway" SET DATA TYPE DECIMAL(78,0) USING "stakeAway"::DECIMAL(78,0);

-- AlterTable
ALTER TABLE "Bet"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(78,0) USING "amount"::DECIMAL(78,0),
  ALTER COLUMN "payout" SET DATA TYPE DECIMAL(78,0) USING "payout"::DECIMAL(78,0);
