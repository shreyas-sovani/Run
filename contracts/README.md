# RUN! contracts

`RunBank` is the onchain bank behind RUN!: a 500-entry deposit ledger, a cash + bonds balance sheet, an optional
speed bump (FIFO queue) and deposit insurance. Depositor decisions are made offchain; the contract pays, prices the
fire sale and decides when the bank fails or survives. Bank maths: `docs/PRD.md` §9. Interface: `src/IRunBank.sol`
(frozen, PRD §11.2).

| File | What |
|---|---|
| `src/RunBank.sol` | the bank (`sealTicks` is PRD §9.4 line by line) |
| `src/Street.sol` | where paid-out AUSD goes; `sweep()` returns it to the bank on `reset` |
| `src/MockAUSD.sol` | fallback token (6 decimals, open mint) |
| `src/IRunTarget.sol` | sketch interface for "plug in your protocol" (not deployed) |

Testnet only: Monad testnet, chain 10143. Addresses: `app/src/config/deployment.testnet.json`.

## Setup

```shell
cp .env.example .env      # OPERATOR_PK, BACKUP_ADDRESS, MONAD_RPC_URL (never commit .env)
forge build
```

## Tests

```shell
forge test                                   # unit, golden vectors, invariants (fork test skips without MONAD_RPC_URL)
set -a; source .env; set +a; forge test      # also runs the Monad testnet fork test
```

- `test/RunBank.t.sol`: ledger, config, lifecycle, tick maths, speed bump, insurance, PRD §9.5 worked example.
- `test/BankVectors.t.sol`: replays B's `app/src/engine/data/vectors/bank-vectors.json`, tick by tick and batched.
- `test/Invariants.t.sol`: AUSD conservation, `depositsOwed == Σ unwithdrawn`, balance sheet identity, nobody paid twice.
- `test/Fork.t.sol`: real AUSD on a testnet fork: Bhau's fails, reset, Monad Mutual survives.

## Scripts (all read `contracts/.env`, run with `--rpc-url monad_testnet --broadcast --slow`)

| Script | Does |
|---|---|
| `Deploy.s.sol` + `fix-deploy-block.js` | deploy `RunBank` (creates `Street`), add the backup operator, write `deployment.testnet.json` |
| `LoadLedger.s.sol` | load `ledger.json` (re-run after B regenerates it; Ready only) |
| `SetLevel.s.sol` | `LEVEL=0\|1`, config from `configs.json` |
| `Fund.s.sol` | top the bank up to `cash + bonds` AUSD |
| `Lifecycle.s.sol` | `ACTION=start\|seal\|reset` for rehearsals and gas calibration |
| `Ping.s.sol` | operator liveness ping |
| `DeployMock.s.sol` | MockAUSD fallback: second bank, writes `deployment.testnet.mock.json` |
| `verify.sh` | verify `RunBank` + `Street` on MonadVision / Monadscan via the devnads API |
| `export-abi.sh` | write `app/src/chain/abi/*.ts` |
