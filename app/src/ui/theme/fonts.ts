// Self-hosted fonts (PRD §14.4, §13.5): nothing is fetched from a CDN at runtime.
// Imported once from main.tsx. Latin subsets only, except Marathi (devanagari for the stamp line).
import '@fontsource-variable/big-shoulders-display/wght'; // Display: wordmark, stamp, timer, vault figures
import '@fontsource-variable/atkinson-hyperlegible-next/wght'; // Body
import '@fontsource-variable/atkinson-hyperlegible-mono/wght'; // Data
import '@fontsource/doto/latin-600.css'; // Passbook dot-matrix, >= 28 px
import '@fontsource/doto/latin-700.css';
import '@fontsource/doto/latin-800.css';
import '@fontsource/tiro-devanagari-marathi/devanagari-400.css'; // "बँक बुडाली" on the failure stamp
import '@fontsource/tiro-devanagari-marathi/latin-400.css';

/** Faces the stage depends on. Loaded explicitly because variable faces are lazy until first use. */
const REQUIRED_FACES = [
  "900 100px 'Big Shoulders Display Variable'",
  "400 16px 'Atkinson Hyperlegible Next Variable'",
  "400 16px 'Atkinson Hyperlegible Mono Variable'",
] as const;

/** Resolves when the fonts the stage needs are ready (never rejects, never hangs the app). */
export async function fontsReady(timeoutMs = 3000): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) return true;
  const settle = Promise.all([...REQUIRED_FACES.map((f) => document.fonts.load(f)), document.fonts.ready]).then(
    () => true,
    () => false,
  );
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([settle, timeout]);
}

/** Synchronous check used by preflight ("Fonts loaded"). */
export function fontsLoaded(): boolean {
  if (typeof document === 'undefined' || !('fonts' in document)) return true;
  return REQUIRED_FACES.every((f) => document.fonts.check(f));
}
