import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function gitShortSha(): string {
  // CLI deploys upload files without .git, so Vercel's build can't run git: pass the sha explicitly
  // (`vercel deploy --build-env BUILD_SHA=$(git rev-parse --short HEAD)`), or use Vercel's own git variable.
  const fromEnv = process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
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

// Absolute URL for og:image / og:url (PRD §13.3 rule 8). Explicit VITE_PUBLIC_URL wins; on Vercel fall back
// to the production domain Vercel exposes; locally use the preview port. Never a relative URL.
if (!process.env.VITE_PUBLIC_URL) {
  process.env.VITE_PUBLIC_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:4173';
}
process.env.VITE_PUBLIC_URL = process.env.VITE_PUBLIC_URL.replace(/\/+$/, '');

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __BUILD_ID__: JSON.stringify(`${gitShortSha()}-${new Date().toISOString()}`) },
  test: { environment: 'node' },
});
