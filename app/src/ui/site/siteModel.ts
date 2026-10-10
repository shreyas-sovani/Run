import { PATHS } from '@/app/store';
import type { NavSection } from '@/app/store';
import { copy } from '@/ui/copy';

export interface NavItem {
  section: NavSection;
  href: string;
  label: string;
}

/** The four places the app can take you, in the order the nav and the landing list them. */
export const NAV_ITEMS: readonly NavItem[] = [
  { section: 'app', href: PATHS.app, label: copy.nav.play },
  { section: 'watch', href: PATHS.watch, label: copy.nav.watch },
  { section: 'replays', href: PATHS.replays, label: copy.nav.replays },
  { section: 'ops', href: PATHS.ops, label: copy.nav.ops },
];

export const LAB_LINKS: readonly { href: string; label: string }[] = [
  { href: PATHS.labs.stage, label: copy.landing.footer.lab.stage },
  { href: PATHS.labs.brand, label: copy.landing.footer.lab.brand },
  { href: PATHS.labs.panels, label: copy.landing.footer.lab.panels },
  { href: PATHS.labs.chain, label: copy.landing.footer.lab.chain },
  { href: PATHS.labs.engine, label: copy.landing.footer.lab.engine },
];
