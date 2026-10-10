// Deployment info (A writes the JSON; C reads it).
import type { Address } from 'viem';
import deploymentJson from '@/config/deployment.testnet.json';

interface DeploymentJson {
  runBank: Address | null;
  street: Address | null;
  ausd: Address;
  deployBlock: number | string | null;
  tokenKind: 'AUSD' | 'MOCK';
}

const dj = deploymentJson as DeploymentJson;

export const deployment: {
  runBank: Address | null;
  street: Address | null;
  ausd: Address;
  deployBlock: bigint | null;
  tokenKind: 'AUSD' | 'MOCK';
  /** Additive: true once a RunBank address is present. */
  deployed: boolean;
} = {
  runBank: dj.runBank ?? null,
  street: dj.street ?? null,
  ausd: dj.ausd,
  deployBlock: dj.deployBlock === null || dj.deployBlock === undefined ? null : BigInt(dj.deployBlock),
  tokenKind: dj.tokenKind,
  deployed: !!dj.runBank,
};
