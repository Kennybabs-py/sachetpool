-- The contract now snapshots rakeBps per pool at launch (see `Pool.rakeBps`
-- in SachetMarket) and pays winners with it, so the mirror must store the
-- snapshot instead of reading the live global rake at resolution time.
ALTER TABLE "Pool" ADD COLUMN     "rakeBps" INTEGER NOT NULL DEFAULT 0;
