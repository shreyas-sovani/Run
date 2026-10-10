// C-11: run the chain smoke test against a local anvil fork of Monad testnet. Costs no testnet MON.
//
//   pnpm chain:fork                     fork, then `chain:smoke --mini` against it
//   pnpm chain:fork --run --card 3      any chain:smoke flags are passed through
//   pnpm chain:fork --keep              leave anvil running (for `VITE_RPC_URL=http://127.0.0.1:8545 pnpm dev`)
//   pnpm chain:fork --port 8546         other port
//
// The testnet deployment (RunBank, Street, AUSD) is already in the fork's state, so nothing needs deploying. The smoke test
// runs twice: once through eth_sendRawTransactionSync, once with --no-sync (the sendRawTransaction + receipt-polling fallback).
// A pointed-at-localhost `rpcOverride` replaces the public RPC list entirely, so this can never touch the real testnet.
//
// To exercise A's own deploy scripts instead, point them at the same URL, e.g.
//   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
// and write the printed addresses into config/deployment.testnet.json on a scratch branch (don't commit those).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NETWORK } from '@/config/network';
import { addressOfKey, normalizePk } from '@/chain/keys';

const argv = process.argv.slice(2);
const flagValue = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const keep = argv.includes('--keep');
const port = Number(flagValue('port') ?? 8545);
const url = `http://127.0.0.1:${port}`;
const passthrough = (() => {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep') continue;
    if (argv[i] === '--port') { i += 1; continue; }
    out.push(argv[i]);
  }
  return out.length ? out : ['--mini'];
})();

const rpc = async <T>(method: string, params: unknown[] = []): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
};

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
function envKey(names: string[]): string | null {
  for (const f of [here('../.env.local'), here('../../.env'), here('../../contracts/.env')]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && names.includes(m[1]) && m[2]) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return process.env[names[0]] ?? null;
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    p.on('exit', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

async function main(): Promise<number> {
  const forkUrl = NETWORK.rpcs.find((r) => r.name === 'QuickNode')!.http;
  console.log(`Forking Monad testnet (chain ${NETWORK.chainId}) from ${forkUrl} on ${url} …`);
  const anvil = spawn('anvil', ['--fork-url', forkUrl, '--chain-id', String(NETWORK.chainId), '--port', String(port), '--silent'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let exited = false;
  anvil.on('exit', () => { exited = true; });
  anvil.on('error', (e) => {
    console.error(`Could not start anvil (${e.message}). Install Foundry: https://getfoundry.sh`);
    exited = true;
  });

  try {
    for (let i = 0; i < 60; i++) {
      if (exited) throw new Error('anvil exited before it was ready');
      try {
        await rpc('eth_chainId');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (i === 59) throw new Error('anvil did not become ready in 30 s');
    }
    console.log(`Fork ready at block ${parseInt(await rpc<string>('eth_blockNumber'), 16)}.`);

    // Give the operator and backup plenty of MON on the fork (anvil cheat code; never touches the real chain).
    for (const names of [['VITE_OPERATOR_PK', 'OPERATOR_PK'], ['VITE_BACKUP_PK', 'BACKUP_PK']]) {
      const pk = normalizePk(envKey(names));
      if (pk) await rpc('anvil_setBalance', [addressOfKey(pk), '0x' + (1000n * 10n ** 18n).toString(16)]);
    }

    let code = await run('pnpm', ['chain:smoke', ...passthrough, '--rpc', url]);
    if (code === 0) {
      console.log('\n=== again with --no-sync: sendRawTransaction + receipt polling ===');
      code = await run('pnpm', ['chain:smoke', ...passthrough, '--rpc', url, '--no-sync']);
    }
    if (keep && code === 0) {
      console.log(`\nanvil is still running at ${url} (Ctrl+C to stop). Point the app at it: VITE_RPC_URL=${url} pnpm dev`);
      await new Promise(() => {});
    }
    return code;
  } finally {
    if (!keep) anvil.kill();
  }
}

process.on('SIGINT', () => process.exit(130));
main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
