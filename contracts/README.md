# SachetMarket

Foundry project for the on-chain singleton that escrows `$SACH` stakes on 1X2
football outcomes and pays winners with a pull model.

## Setup

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
```

## Build & test

```bash
forge build
forge test -vvv
```

## Deploy

Deployment is driven from the app root by a viem script (so it can reuse the
same chain config as the app), not by `forge script`:

```bash
# from the repo root, after `forge build`
yarn export:abi   # copies out/SachetMarket.sol/SachetMarket.json ABI into lib/contracts
yarn deploy:market
```

Required env (see `.env.example`): `RPC_URL`, `SACH_TOKEN_ADDRESS`,
`TREASURY_ADDRESS`, `OPERATOR_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`,
`MIN_STAKE` (token base units).
