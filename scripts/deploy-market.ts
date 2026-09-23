import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, RPC_URL } from "../config/chains";

/**
 * One-shot `SachetMarket` deployment.
 *
 *   yarn deploy:market
 *
 * Reads constructor args from env and prints the deployed address. Run
 * `forge build` first so `contracts/out/` exists.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function asAddress(name: string): Address {
  return getAddress(required(name));
}

function privateKey(name: string): `0x${string}` {
  const raw = required(name);
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

async function main() {
  const artifactPath = resolve(
    process.cwd(),
    "contracts/out/SachetMarket.sol/SachetMarket.json",
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi: readonly unknown[];
    bytecode: { object: `0x${string}` };
  };

  const token = asAddress("SACH_TOKEN_ADDRESS");
  
  // The admin address can be explicitly provided, or derived from a private key.
  // For testnet deployments, we'll derive it from the deployer or a specific admin key.
  const adminMultisig = process.env.ADMIN_ADDRESS 
    ? asAddress("ADMIN_ADDRESS") 
    : privateKeyToAccount(privateKey("DEPLOYER_PRIVATE_KEY")).address;
    
  const rakeBps = BigInt(process.env.RAKE_BPS || "5");

  const account = privateKeyToAccount(privateKey("DEPLOYER_PRIVATE_KEY"));
  const transport = http(RPC_URL);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  console.log(
    `Deploying SachetMarket to ${chain.name} (${chain.id}) from ${account.address}…`,
  );
  console.log({ token, adminMultisig, rakeBps: rakeBps.toString() });

  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [token, adminMultisig, rakeBps],
    account,
    chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`Deployment failed: ${hash}`);
  }

  console.log(`\nSachetMarket deployed at ${receipt.contractAddress}`);
  console.log(`Tx: ${hash}`);
  console.log(
    `\nAdd to your env:\n  MARKET_ADDRESS="${receipt.contractAddress}"\n  MARKET_DEPLOY_BLOCK="${receipt.blockNumber}"`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
