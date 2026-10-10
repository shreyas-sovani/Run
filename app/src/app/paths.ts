// Every route the app serves (PRD §13.1). The landing links to all of them; the nav and the hotkeys read the same list.
export const PATHS = {
  home: '/',
  app: '/app',
  watch: '/watch',
  replays: '/replay',
  replay: (id: string) => `/replay/${encodeURIComponent(id)}`,
  ops: '/ops',
  labs: {
    stage: '/lab/stage',
    brand: '/lab/brand',
    panels: '/lab/panels',
    chain: '/lab/chain',
    engine: '/lab/engine',
  },
} as const;

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** Routes that render the stage. Stage hotkeys apply only here, so a key press on the landing never starts a run. */
export function isStageRoute(pathname: string): boolean {
  const p = normalize(pathname);
  return p === PATHS.app || p === PATHS.watch || p.startsWith(`${PATHS.replays}/`) || p === PATHS.labs.stage;
}

export type NavSection = 'app' | 'watch' | 'replays' | 'ops';

/** Which nav section a path belongs to, for `aria-current`. `null` on the landing, labs and unknown paths. */
export function navSectionOf(pathname: string): NavSection | null {
  const p = normalize(pathname);
  if (p === PATHS.app) return 'app';
  if (p === PATHS.watch) return 'watch';
  if (p === PATHS.replays || p.startsWith(`${PATHS.replays}/`)) return 'replays';
  if (p === PATHS.ops) return 'ops';
  return null;
}
