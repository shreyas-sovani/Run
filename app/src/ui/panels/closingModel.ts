// Pure helpers for the closing card (E-10).

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i;

/**
 * The URL the QR code and the printed link point at. `VITE_PUBLIC_URL` wins unless it is a local address
 * (F's build falls back to http://localhost:4173), in which case the page's own origin is the best guess.
 */
export function publicBase(env: string | undefined, origin: string): string {
  const clean = (u: string) => u.trim().replace(/\/+$/, '');
  if (env && env.trim()) {
    try {
      const u = new URL(env.trim());
      if (!LOCAL.test(u.hostname)) return clean(env);
    } catch {
      // not a URL: fall through to the origin
    }
  }
  return clean(origin);
}

/** `https://run.vercel.app/watch` → `run.vercel.app/watch` for printing on the card. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}
