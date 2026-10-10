import type { Address as Addr, Hex } from 'viem';
import { HexRef } from './HexRef';

/** Truncated address (`0x5a3f…9e21`) with copy and explorer links. Never render raw hex anywhere else. */
export function Address(props: { address: Addr; label?: string }) {
  return <HexRef kind="address" value={props.address} label={props.label} />;
}

/** Truncated transaction hash with copy and explorer links. */
export function TxLink(props: { hash: Hex; label?: string }) {
  return <HexRef kind="tx" value={props.hash} label={props.label} />;
}
