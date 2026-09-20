// Copies the compiled `SachetMarket` ABI into `lib/contracts/sachet-market.ts`
// so the app imports a typed const instead of reading Foundry artifacts at
// runtime. Run after `forge build`:  node scripts/export-abi.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "contracts/out/SachetMarket.sol/SachetMarket.json",
);
const outPath = resolve(root, "lib/contracts/sachet-market.ts");

let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch (err) {
  console.error(
    `Could not read ${artifactPath}.\nRun \`forge build\` in contracts/ first.`,
  );
  throw err;
}

if (!Array.isArray(artifact.abi)) {
  throw new Error("Artifact has no `abi` array");
}

const header = `/**
 * \`SachetMarket\` ABI.
 *
 * \u26a0\ufe0f Generated from \`contracts/out/SachetMarket.sol/SachetMarket.json\` by
 * \`yarn export:abi\` (\`scripts/export-abi.mjs\`). Edit the Solidity contract, not
 * this file.
 */
`;

writeFileSync(
  outPath,
  `${header}export const sachetMarketAbi = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`,
);
console.log(`Wrote ${artifact.abi.length} ABI entries to lib/contracts/sachet-market.ts`);
