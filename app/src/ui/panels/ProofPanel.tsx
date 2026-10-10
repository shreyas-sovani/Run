import { useEffect, useMemo, useRef } from 'react';
import { explorerAddress } from '@/chain';
import { runActions, useRunView } from '@/app/store';
import type { RunView } from '@/types';
import { Address, Button, CheckIcon, CrossIcon, TxLink } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtAusd, fmtAusdWithUsd, fmtUsdScaled, fmtBlock, fmtCount, fmtGas, fmtSealTime, fmtTimeOfDay } from '@/ui/format';
import { agreement, buildProof, isFinalized } from './proofModel';
import s from './ProofPanel.module.css';

/** What the proof panel reads from the run view (a slice, so the lab can feed fixtures). */
export type ProofData = Pick<
  RunView,
  'mode' | 'phase' | 'seals' | 'outcome' | 'finalizedBlock' | 'onchain' | 'deployment' | 'mirror' | 'decisions' | 'replay' | 'sealedTick'
> & { practice: { tick: number; withdrawn: number; loss: bigint } | null };

function useProofData(): ProofData {
  // Selector returns primitives and store-owned references only (F: nested fresh objects would re-render forever).
  const slice = useRunView((v) => ({
    mode: v.mode,
    phase: v.phase,
    seals: v.seals,
    outcome: v.outcome,
    finalizedBlock: v.finalizedBlock,
    onchain: v.onchain,
    deployment: v.deployment,
    mirror: v.mirror,
    decisions: v.decisions,
    replay: v.replay,
    sealedTick: v.sealedTick,
    pTick: v.frame?.tick ?? -1,
    pWithdrawn: v.frame?.bank.withdrawnCount ?? 0,
    pLoss: v.frame?.bank.cumulativeLoss ?? 0n,
  }));
  const { pTick, pWithdrawn, pLoss, ...rest } = slice;
  return useMemo(
    () => ({ ...rest, practice: pTick >= 0 ? { tick: pTick, withdrawn: pWithdrawn, loss: pLoss } : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...Object.values(rest), pTick, pWithdrawn, pLoss],
  );
}

/** Slides over the vault column. `Esc` and the close button close it (PRD §13.4). */
export function ProofPanel(props: { open: boolean; onClose(): void }) {
  const data = useProofData();
  const asideRef = useRef<HTMLElement>(null);
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    asideRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside ref={asideRef} className={s.panel} role="dialog" aria-label={copy.proof.title} tabIndex={-1} data-testid="proof-panel">
      <header className={s.head}>
        <div>
          <h2 className={s.title}>{copy.proof.title}</h2>
          <p className={s.sub}>{copy.proof.subtitle}</p>
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label={copy.proof.close} title={copy.buttons.close}>
          <CrossIcon />
        </button>
      </header>
      <ProofContent
        data={data}
        onWatchRecorded={() => {
          onClose();
          runActions.setMode('replay');
        }}
      />
    </aside>
  );
}

function Row(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={s.row}>
      <dt className={s.dt} title={props.hint}>
        {props.label}
      </dt>
      <dd className={s.dd}>{props.children}</dd>
    </div>
  );
}

function FinalBadge({ final, simulated }: { final: boolean; simulated?: boolean }) {
  if (simulated) return <span className={`${s.badge} ${s.badgeSim}`}>{copy.proof.simulated}</span>;
  return final ? (
    <span className={`${s.badge} ${s.badgeOk}`}>
      <CheckIcon /> {copy.proof.finalized}
    </span>
  ) : (
    <span className={`${s.badge} ${s.badgeWait}`}>{copy.proof.notFinalized}</span>
  );
}

/** The panel's body. Pure on `data`, so `/lab/panels` can render it against fixtures. */
export function ProofContent(props: { data: ProofData; onWatchRecorded(): void }) {
  const d = props.data;
  const model = useMemo(
    () => buildProof({ mode: d.mode, seals: d.seals, outcome: d.outcome, sealedTick: d.sealedTick }),
    [d.mode, d.seals, d.outcome, d.sealedTick],
  );

  if (model.source === 'practice') return <PracticeBody data={d} onWatchRecorded={props.onWatchRecorded} />;

  const recorded = model.source === 'recorded';
  const agree = agreement(d.mirror);
  const { runBank, street, ausd } = d.deployment;
  const hasRun = model.rumor !== null || model.txCount > 0;

  return (
    <div className={s.body}>
      <p className={`${s.mode} ${recorded ? s.modeRec : s.modeLive}`}>
        {recorded ? `${copy.proof.recorded}: ${copy.proof.replay.note}` : copy.chips.live}
      </p>

      {!hasRun ? <p className={s.empty}>{copy.proof.emptyIdle}</p> : null}

      <section className={s.sect} aria-labelledby="pf-agree">
        <h3 id="pf-agree" className={s.h3}>
          {copy.proof.agreeTitle}
        </h3>
        {agree.state === 'none' ? (
          <p className={s.agreeNone}>{copy.proof.agreeNone}</p>
        ) : agree.state === 'agree' ? (
          <p className={`${s.agree} ${s.agreeOk} tnum`}>
            <span className={s.agreeIcon}>
              <CheckIcon />
            </span>
            {copy.proof.agree(d.mirror.matched, d.mirror.total)}
          </p>
        ) : (
          <p className={`${s.agree} ${s.agreeBad} tnum`} role="alert">
            {d.mirror.firstMismatchTick !== null
              ? copy.proof.agreeMismatch(d.mirror.firstMismatchTick)
              : `${d.mirror.matched} / ${d.mirror.total}`}
          </p>
        )}
        {d.decisions ? (
          <p className={s.line} title={copy.proof.decisionsHint}>
            <strong>{copy.proof.decisionsTitle}:</strong> <span className="tnum">{copy.proof.decisions(d.decisions.matched, d.decisions.total)}</span>
          </p>
        ) : null}
      </section>

      <section className={s.sect} aria-labelledby="pf-rumor">
        <h3 id="pf-rumor" className={s.h3}>
          {copy.proof.rumor}
        </h3>
        {model.rumor?.txHash ? (
          <dl className={s.list}>
            <Row label={copy.generic.tx}>
              <TxLink hash={model.rumor.txHash} />
            </Row>
            {model.rumor.blockNumber !== null ? (
              <Row label={copy.proof.rumorBlock}>
                <span className="tnum">{fmtBlock(model.rumor.blockNumber)}</span>
              </Row>
            ) : null}
            {model.rumor.sealedAtMs !== null && !recorded ? (
              <Row label={copy.proof.rumorSealed}>
                <span className="tnum">{fmtTimeOfDay(model.rumor.sealedAtMs)}{' '}</span>
                <FinalBadge final={isFinalized(model.rumor, d.finalizedBlock)} />
              </Row>
            ) : null}
          </dl>
        ) : (
          <p className={s.empty}>{copy.proof.waiting}</p>
        )}
      </section>

      {model.biggest?.record.txHash ? (
        <section className={s.sect} aria-labelledby="pf-big">
          <h3 id="pf-big" className={s.h3} title={copy.proof.biggestHint}>
            {copy.proof.biggest}
          </h3>
          <p className={s.line}>{copy.proof.biggestCount(model.biggest.count)}</p>
          <dl className={s.list}>
            <Row label={copy.generic.tx}>
              <TxLink hash={model.biggest.record.txHash} />
            </Row>
            {model.biggest.record.blockNumber !== null ? (
              <Row label={copy.proof.rumorBlock}>
                <span className="tnum">{fmtBlock(model.biggest.record.blockNumber)}</span>{' '}
                <FinalBadge final={isFinalized(model.biggest.record, d.finalizedBlock)} />
              </Row>
            ) : null}
            {model.biggest.record.gasUsed !== null ? (
              <Row label={copy.proof.gasUsed}>
                <span className="tnum">{fmtGas(model.biggest.record.gasUsed)}</span>
              </Row>
            ) : null}
            {model.biggest.sealMs !== null ? (
              <Row label={copy.proof.sealTime}>
                <span className="tnum">{fmtSealTime(model.biggest.sealMs)}</span>
              </Row>
            ) : null}
          </dl>
        </section>
      ) : null}

      {model.verdict ? (
        <section className={s.sect} aria-labelledby="pf-verdict">
          <h3 id="pf-verdict" className={s.h3}>
            {copy.proof.verdict}
          </h3>
          <p className={`${s.verdict} ${model.verdict.outcome.kind === 'failed' ? s.vFail : s.vOk}`}>
            <code>{model.verdict.outcome.kind === 'failed' ? copy.proof.verdictFailed : copy.proof.verdictSurvived}</code>
            <span className="tnum">tick {model.verdict.outcome.tick}</span>
          </p>
          <dl className={s.list}>
            {model.verdict.record?.txHash ? (
              <Row label={copy.generic.tx}>
                <TxLink hash={model.verdict.record.txHash} />
              </Row>
            ) : null}
            {model.verdict.outcome.outcomeBlock !== null ? (
              <Row label={copy.proof.rumorBlock}>
                <span className="tnum">{fmtBlock(model.verdict.outcome.outcomeBlock)}</span>{' '}
                {model.verdict.record ? <FinalBadge final={isFinalized(model.verdict.record, d.finalizedBlock)} /> : null}
              </Row>
            ) : null}
            {model.verdict.outcome.trappedCount > 0 ? (
              <>
                <Row label={copy.proof.trapped}>
                  <span className="tnum">
                    {copy.proof.trappedLine(model.verdict.outcome.trappedCount, fmtAusdWithUsd(model.verdict.outcome.trappedAmount))}
                  </span>
                </Row>
                <Row label={copy.proof.uninsured}>
                  <span className="tnum">{fmtAusdWithUsd(model.verdict.outcome.uninsuredTrapped)}</span>
                </Row>
              </>
            ) : (
              <Row label={copy.proof.trapped}>
                <span className="tnum">{fmtCount(0, 'depositor')}</span>
              </Row>
            )}
          </dl>
        </section>
      ) : null}

      {d.onchain ? (
        <section className={s.sect} aria-labelledby="pf-street">
          <h3 id="pf-street" className={s.h3} title={copy.proof.street_out_hint}>
            {copy.proof.street_out}
          </h3>
          <p className={`${s.big} tnum`}>{fmtAusd(d.onchain.streetHeld)}</p>
          <p className={`${s.line} tnum`}>{`${fmtUsdScaled(d.onchain.streetHeld)} at ${copy.scale.note}`}</p>
          <p className={s.hint}>
            {copy.proof.street_out_hint}
            {d.onchain.readAtBlock !== null ? ` · ${copy.generic.block.toLowerCase()} ${fmtBlock(d.onchain.readAtBlock)}` : ''}
          </p>
        </section>
      ) : null}

      <section className={s.sect} aria-labelledby="pf-contracts">
        <h3 id="pf-contracts" className={s.h3}>
          {copy.proof.contracts}
        </h3>
        <dl className={s.list}>
          <Row label={copy.proof.bank}>
            {runBank ? (
              <>
                <Address address={runBank} />{' '}
                <a className={s.src} href={explorerAddress(runBank)} target="_blank" rel="noopener noreferrer">
                  {copy.proof.verifiedSource}
                </a>
              </>
            ) : (
              <span className={s.muted}>{copy.generic.notDeployed}</span>
            )}
          </Row>
          <Row label={copy.proof.street} hint={copy.proof.street_hint}>
            {street ? (
              <>
                <Address address={street} />{' '}
                <a className={s.src} href={explorerAddress(street)} target="_blank" rel="noopener noreferrer">
                  {copy.proof.verifiedSource}
                </a>
              </>
            ) : (
              <span className={s.muted}>{copy.generic.notDeployed}</span>
            )}
          </Row>
          <Row label={copy.proof.ausd}>
            <Address address={ausd} />
          </Row>
        </dl>
      </section>

      <p className={s.foot}>{copy.proof.scaleNote}</p>
    </div>
  );
}

function PracticeBody({ data, onWatchRecorded }: { data: ProofData; onWatchRecorded(): void }) {
  const p = data.practice;
  return (
    <div className={s.body}>
      <p className={`${s.mode} ${s.modePractice}`}>{copy.chips.practice}</p>
      <section className={s.sect}>
        <h3 className={s.h3}>{copy.proof.practice.title}</h3>
        <p className={s.line}>{copy.proof.practice.body}</p>
        <div className={s.cta}>
          <Button onClick={onWatchRecorded}>{copy.proof.practice.cta}</Button>
        </div>
      </section>
      {p && p.tick > 0 ? (
        <section className={s.sect} aria-labelledby="pf-prac">
          <h3 id="pf-prac" className={s.h3}>
            {copy.proof.practice.stats}
          </h3>
          <dl className={s.list}>
            <Row label={copy.proof.ticks}>
              <span className="tnum">{p.tick}</span>
            </Row>
            <Row label={copy.proof.practice.withdrew}>
              <span className="tnum">{fmtCount(p.withdrawn, 'depositor')}</span>
            </Row>
            <Row label={copy.proof.practice.loss}>
              <span className="tnum">{fmtAusdWithUsd(p.loss)}</span>
            </Row>
          </dl>
        </section>
      ) : null}
      <p className={s.foot}>{copy.proof.scaleNote}</p>
    </div>
  );
}
