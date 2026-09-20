import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest only owns the pure TypeScript unit tests (odds, leaderboard). The
 * Solidity suite runs under `forge test`; the vendored Foundry libs and the
 * generated Prisma client must stay out of the test glob.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    exclude: ["node_modules/**", "contracts/**", ".next/**", "generated/**"],
  },
});
