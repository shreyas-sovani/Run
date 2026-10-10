export const faucetAbi = [
  { type: 'function', name: 'requestFunds', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [] },
] as const;
