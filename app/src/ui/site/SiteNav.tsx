import { Link, useLocation } from 'wouter';
import { PATHS, navSectionOf } from '@/app/store';
import { copy } from '@/ui/copy';
import { NAV_ITEMS } from './siteModel';
import s from './SiteNav.module.css';

function Links(props: { current: ReturnType<typeof navSectionOf> }) {
  return (
    <ul className={s.links}>
      {NAV_ITEMS.map((item) => (
        <li key={item.section}>
          <Link className={s.link} href={item.href} aria-current={props.current === item.section ? 'page' : undefined}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Site navigation. `landing`: the home page header (wordmark, sections, the primary action).
 * `app` (default): a slim bar above the stage, the replay list and the ops page; hidden in full screen so the
 * projector shows only the stage.
 */
export function SiteNav(props: { variant?: 'app' | 'landing' }) {
  const [path] = useLocation();
  const current = navSectionOf(path);
  if (props.variant === 'landing') {
    return (
      <header className={s.landing}>
        <nav className={s.landingInner} aria-label={copy.nav.aria}>
          <Link className={s.wordmark} href={PATHS.home} aria-label={copy.nav.homeTitle}>
            {copy.brand.name}
          </Link>
          <Links current={current} />
          <Link className={s.start} href={PATHS.app}>
            {copy.nav.start}
          </Link>
        </nav>
      </header>
    );
  }
  return (
    <nav className={s.bar} aria-label={copy.nav.aria} data-site-nav>
      <Link className={s.home} href={PATHS.home} title={copy.nav.homeTitle}>
        <span aria-hidden="true">←</span> {copy.nav.home}
      </Link>
      <Links current={current} />
      <span className={s.network}>
        <span className={s.dot} aria-hidden="true" />
        {copy.nav.network}
      </span>
    </nav>
  );
}
