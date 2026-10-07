import "dotenv/config";
import { runIndexer } from "../lib/indexer";

/**
 * One-shot chain → Postgres backfill.
 *
 *   yarn indexer:backfill
 *
 * Runs the same chunked indexer the cron uses, repeatedly, until the mirror
 * catches up. Use it to drain a large backlog immediately instead of waiting
 * for many cron ticks; progress is persisted in `ChainCursor` and each run is
 * idempotent, so it is safe to interrupt and resume.
 */
async function main() {
  let totalProcessed = 0;
  let runs = 0;

  for (;;) {
    const result = await runIndexer();
    runs++;
    totalProcessed += result.processed;
    console.log(
      `[run ${runs}] ${result.fromBlock}→${result.toBlock} ` +
        `(latest ${result.latestBlock}) processed=${result.processed} ` +
        `skipped=${result.skipped} caughtUp=${result.caughtUp}`,
    );
    if (result.caughtUp) break;
  }

  console.log(`Backfill complete: ${totalProcessed} events applied in ${runs} runs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
