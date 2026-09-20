-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('RESULT_1X2');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('PENDING_ONCHAIN', 'OPEN', 'LOCKED', 'RESOLVED', 'VOID');

-- CreateEnum
CREATE TYPE "Selection" AS ENUM ('HOME', 'DRAW', 'AWAY');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'CLAIMED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeTeamLogo" TEXT,
    "awayTeamLogo" TEXT,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "onchainPoolId" TEXT NOT NULL,
    "type" "PoolType" NOT NULL DEFAULT 'RESULT_1X2',
    "status" "PoolStatus" NOT NULL DEFAULT 'PENDING_ONCHAIN',
    "rakeBps" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createTxHash" TEXT,
    "totalStake" BIGINT NOT NULL DEFAULT 0,
    "stakeHome" BIGINT NOT NULL DEFAULT 0,
    "stakeDraw" BIGINT NOT NULL DEFAULT 0,
    "stakeAway" BIGINT NOT NULL DEFAULT 0,
    "winningSelection" "Selection",
    "resolvedTxHash" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "selection" "Selection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "BetStatus" NOT NULL DEFAULT 'PENDING',
    "payout" BIGINT NOT NULL DEFAULT 0,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "claimTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "address" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "poolId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainCursor" (
    "id" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Pool_onchainPoolId_key" ON "Pool"("onchainPoolId");

-- CreateIndex
CREATE INDEX "Pool_status_idx" ON "Pool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Pool_matchId_type_key" ON "Pool"("matchId", "type");

-- CreateIndex
CREATE INDEX "Bet_poolId_idx" ON "Bet"("poolId");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "Bet"("status");

-- CreateIndex
CREATE INDEX "Bet_userId_idx" ON "Bet"("userId");

-- CreateIndex
CREATE INDEX "Bet_address_idx" ON "Bet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_txHash_logIndex_key" ON "Bet"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "ChainEvent_eventName_idx" ON "ChainEvent"("eventName");

-- CreateIndex
CREATE INDEX "ChainEvent_blockNumber_idx" ON "ChainEvent"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_txHash_logIndex_key" ON "ChainEvent"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
