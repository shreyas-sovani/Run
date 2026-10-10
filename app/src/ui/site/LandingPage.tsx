import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PATHS, useUi } from '@/app/store';
import { deployment, listReplays, loadReplay } from '@/chain';
import { loadModel } from '@/engine';
import type { ReplayFile, ReplayIndexEntry } from '@/types';
import { Address, PaperBackground } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtAusd, fmtRecorded, fmtUsdScaled } from '@/ui/format';
import { buildStory, chooseHero, heroCandidates, newestReplayId } from './landingModel';
import type { Story } from './landingModel';
import { MiniNetwork } from './MiniNetwork';
import { PassbookPrint } from './PassbookPrint';
import { SiteNav } from './SiteNav';
import { LAB_LINKS, NAV_ITEMS } from './siteModel';
import s from './Landing.module.css';

const L = copy.landing;
const STORY_KEYS = ['spread', 'run', 'fail'] as const;

function money(base: bigint): string {
  return `${fmtAusd(base)} (${fmtUsdScaled(base)})`;
}

type Entries = { status: 'loading' } | { status: 'ready'; list: ReplayIndexEntry[] } | { status: 'error' };

function useRecordings(): { entries: Entries; story: Story | null | undefined } {
  const model = useMemo(() => loadModel(), []);
  const [entries, setEntries] = useState<Entries>({ status: 'loading' });
  const [story, setStory] = useState<Story | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      const list = await listReplays();
      if (!live) return;
      setEntries({ status: 'ready', list });
      const files = await Promise.all(heroCandidates(list).map((e) => loadReplay(e.id).catch(() => null)));
      const hero = chooseHero(files.filter((f): f is ReplayFile => f !== null));
      if (live) setStory(hero ? buildStory(model, hero) : null);
    })().catch(() => {
      if (!live) return;
      setEntries({ status: 'error' });
      setStory(null);
    });
    return () => {
      live = false;
    };
  }, [model]);
  return { entries, story };
}

function Legend() {
  const g = L.story.legend;
  return (
    <ul className={s.legend}>
      <li>
        <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" className={s.gCalm} /></svg>
        {g.calm}
      </li>
      <li>
        <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3.8" className={s.gHeard} /></svg>
        {g.heard}
      </li>
      <li>
        <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" className={s.gPanic} /></svg>
        {g.panicking}
      </li>
      <li>
        <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" className={s.gWithdrew} /></svg>
        {g.withdrew}
      </li>
      <li>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" className={s.gTrapped} /></svg>
        {g.trapped}
      </li>
    </ul>
  );
}

function StorySection(props: { story: Story }) {
  const model = useMemo(() => loadModel(), []);
  return (
    <section className={s.section} aria-labelledby="story-title">
      <div className={s.sectionHead}>
        <h2 id="story-title" className={s.h2}>{L.story.title}</h2>
        <p className={s.sectionLead}>{L.story.lead}</p>
      </div>
      <ol className={s.frames}>
        {props.story.frames.map((f, i) => {
          const key = STORY_KEYS[i];
          const body =
            key === 'spread'
              ? L.story.spread.body(f.heard)
              : key === 'run'
                ? L.story.run.body(f.withdrew, money(f.withdrawn))
                : L.story.fail.body(f.trapped, money(f.trappedAmount));
          return (
            <li key={key}>
              <figure className={s.frame}>
                <div className={s.canvasBox}>
                  <MiniNetwork model={model} nodeState={f.nodeState} label={L.story.aria(f.tick, f.heard, f.withdrew)} />
                </div>
                <figcaption className={s.frameText}>
                  <span className={s.tick}>{L.story.tick(f.tick)}</span>
                  <h3 className={s.h3}>{L.story[key].title}</h3>
                  <p>{body}</p>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>
      <Legend />
    </section>
  );
}

function Recordings(props: { entries: Entries }) {
  const { entries } = props;
  const list =
    entries.status === 'ready' ? entries.list.slice().sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)) : [];
  return (
    <div>
      <h2 className={s.h2}>{L.recorded.title}</h2>
      <p className={s.sectionLead}>{L.recorded.lead}</p>
      {entries.status === 'loading' ? (
        <p className={s.muted} role="status">{L.recorded.loading}</p>
      ) : entries.status === 'error' ? (
        <p className={s.muted} role="alert">{L.recorded.error}</p>
      ) : list.length === 0 ? (
        <p className={s.muted}>{L.recorded.empty}</p>
      ) : (
        <ul className={s.runs}>
          {list.map((e) => (
            <li key={e.id}>
              <Link className={s.run} href={PATHS.replay(e.id)}>
                <span className={s.runText}>
                  <span className={s.runBank}>
                    {copy.banks[e.level].name}
                    <span className={`${s.badge} ${e.kind === 'failed' ? s.failed : s.survived}`}>
                      <span aria-hidden="true">{e.kind === 'failed' ? '✕' : '✓'}</span>
                      {e.kind === 'failed' ? copy.replays.failed : copy.replays.survived}
                    </span>
                  </span>
                  <span className={s.runName}>{e.name}</span>
                  <span className={`${s.runWhen} tnum`}>{copy.replays.recorded(fmtRecorded(e.recordedAt))}</span>
                </span>
                <span className={s.runPlay}>
                  {L.recorded.play} <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={s.more} href={PATHS.replays}>
        {L.recorded.all} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function Contracts() {
  const c = L.contracts;
  const rows = [
    { label: c.runBank, addr: deployment.runBank },
    { label: c.street, addr: deployment.street },
    { label: c.ausd, addr: deployment.ausd },
  ];
  return (
    <div>
      <h2 className={s.h2}>{c.title}</h2>
      <p className={s.sectionLead}>{c.lead}</p>
      <dl className={s.contracts}>
        {rows.map((r) => (
          <div key={r.label} className={s.contract}>
            <dt>{r.label}</dt>
            <dd>{r.addr ? <Address address={r.addr} /> : c.notDeployed}</dd>
          </div>
        ))}
      </dl>
      {deployment.runBank ? <p className={s.muted}>{c.verified}</p> : null}
    </div>
  );
}

/** `/`: what RUN! is, the proof that it is real, and a way into every part of the app. */
export function LandingPage() {
  const reduced = useUi((u) => u.reducedMotion);
  const { entries, story } = useRecordings();
  const newest = entries.status === 'ready' ? newestReplayId(entries.list) : null;
  const buildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

  return (
    <div className={s.page}>
      <PaperBackground />
      <SiteNav variant="landing" />
      <main>
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroCopy}>
            <h1 id="hero-title" className={s.headline}>
              {L.headline.map((line) => (
                <span key={line} className={s.headLine}>
                  {line}
                </span>
              ))}
            </h1>
            <p className={s.lead}>{L.lead}</p>
            <div className={s.ctas}>
              <Link className={s.ctaPrimary} href={PATHS.app}>
                {L.start}
              </Link>
              <Link className={s.ctaSecondary} href={newest ? PATHS.replay(newest) : PATHS.replays}>
                {L.watchSealed}
              </Link>
            </div>
            <p className={s.fine}>{L.fineprint}</p>
          </div>
          <div className={s.heroBook}>
            <PassbookPrint hero={story === undefined ? undefined : (story?.hero ?? null)} reducedMotion={reduced} />
          </div>
        </section>

        <section className={s.section} aria-labelledby="ways-title">
          <div className={s.sectionHead}>
            <h2 id="ways-title" className={s.h2}>{L.ways.title}</h2>
            <p className={s.sectionLead}>{L.ways.lead}</p>
          </div>
          <ul className={s.slips}>
            {NAV_ITEMS.map((item) => {
              const w = L.ways[item.section];
              return (
                <li key={item.section}>
                  <Link className={s.slip} href={item.href}>
                    <span className={s.stub}>
                      <span className={s.path}>{item.href}</span>
                      <span className={s.tag}>{w.tag}</span>
                    </span>
                    <span className={s.slipBody}>
                      <span className={s.slipTitle}>{w.title}</span>
                      <span className={s.slipText}>{w.body}</span>
                      <span className={s.slipCta}>
                        {w.cta} <span aria-hidden="true">→</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {story ? <StorySection story={story} /> : null}

        <section className={`${s.section} ${s.split}`}>
          <Recordings entries={entries} />
          <Contracts />
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footNote}>
            <span className={s.footMark}>{copy.brand.name}</span>
            <p>
              {L.footer.built} {L.footer.honesty}
            </p>
          </div>
          <nav className={s.labs} aria-label={L.footer.labs}>
            <span className={s.labsLabel}>{L.footer.labs}</span>
            <ul>
              {LAB_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
            <span className={s.build}>{L.footer.build(buildId)}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
