import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

// Build guard (PRD §15.2): a Vercel build must never see an operator key.
if (process.env.VERCEL) {
  const leaked = Object.keys(process.env).filter((k) => /^VITE_.*PK$/.test(k));
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to build on Vercel: remove ${leaked.join(', ')} from the project's environment variables. Keys never go to Vercel.`,
    );
  }
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __BUILD_ID__: JSON.stringify(`${gitShortSha()}-${new Date().toISOString()}`) },
  test: { environment: 'node' },
});
