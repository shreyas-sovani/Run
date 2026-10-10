/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_OPERATOR_PK?: string;
  readonly VITE_BACKUP_PK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
