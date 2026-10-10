#!/usr/bin/env bash
# Verify RunBank and Street on MonadVision / Socialscan / Monadscan via the devnads API (monskills scaffold).
# Repeatable after a redeploy: reads addresses from app/src/config/deployment.testnet.json.
set -euo pipefail
cd "$(dirname "$0")/.."
DEP="../app/src/config/deployment.testnet.json"
field() { node -e 'console.log(require(process.argv[1])[process.argv[2]])' "$DEP" "$1"; }
RUNBANK=$(field runBank); STREET=$(field street); AUSD=$(field ausd); OPERATOR=$(field operator)
COMPILER="v0.8.28+commit.7893614a"
forge build >/dev/null

verify() { # <address> <path:Name> <constructor-args-no-0x>
  local addr="$1" name="$2" args="$3" file="${2%%:*}" contract="${2##*:}"
  forge verify-contract "$addr" "$name" --chain 10143 --show-standard-json-input > "/tmp/run-$contract-std.json"
  ADDR="$addr" NAME="$name" ARGS="$args" CONTRACT="$contract" FILE="$file" COMPILER="$COMPILER" node -e '
    const fs = require("fs");
    const e = process.env;
    const meta = JSON.parse(fs.readFileSync(`out/${e.FILE.split("/").pop()}/${e.CONTRACT}.json`, "utf8")).metadata;
    const body = {
      chainId: 10143, contractAddress: e.ADDR, contractName: e.NAME, compilerVersion: e.COMPILER,
      standardJsonInput: JSON.parse(fs.readFileSync(`/tmp/run-${e.CONTRACT}-std.json`, "utf8")),
      foundryMetadata: meta, constructorArgs: e.ARGS,
    };
    fs.writeFileSync(`/tmp/run-${e.CONTRACT}-verify.json`, JSON.stringify(body));
  '
  echo "== verifying $name at $addr"
  curl -sS -X POST https://agents.devnads.com/v1/verify -H "Content-Type: application/json" -d @"/tmp/run-$contract-verify.json"
  echo
}

RB_ARGS=$(cast abi-encode "constructor(address,address)" "$AUSD" "$OPERATOR"); RB_ARGS=${RB_ARGS#0x}
ST_ARGS=$(cast abi-encode "constructor(address)" "$AUSD"); ST_ARGS=${ST_ARGS#0x}
verify "$RUNBANK" "src/RunBank.sol:RunBank" "$RB_ARGS"
verify "$STREET"  "src/Street.sol:Street"   "$ST_ARGS"
