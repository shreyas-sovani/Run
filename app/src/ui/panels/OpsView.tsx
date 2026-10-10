import { useId, useMemo, useState } from 'react';
import type { Hex } from 'viem';
import type { PreflightCheck, PreflightReport, RunView, UiError } from '@/types';
import { Link } from 'wouter';
import { Address, Button, CheckIcon, CrossIcon } from '@/ui/brand';
import { copy } from '@/ui/copy';
import { fmtMon, fmtRecorded } from '@/ui/format';
import { checkKeys, checkRpc, checksForStep, deriveSteps, STEP_ORDER } from './opsModel';
import type { StepId } from './opsModel';
import s from './OpsPage.module.css';

export interface OpsViewProps {
  operator: RunView['operator'];
  preflight: PreflightReport | null;
  pending: RunView['pending'];
  deployment: RunView['deployment'];
  error: UiError | null;
  /** Where the loaded key came from (`env` = a local `.env.local`). */
  keySource: 'session' | 'env' | null;
  /** Build id shown in the footer (PRD §15.3 stale-build check). */
  buildId: string;
  onLoadKeys(keys: { primary: Hex; backup: Hex | null; rpcOverride: string | null }): Promise<void> | void;
  /** Reconnect the already-loaded keys with another RPC (or none). */
  onReconnectRpc(rpcOverride: string | null): Promise<void> | void;
  onForget(): void;
  onRecheck(): Promise<void> | void;
  onFund(): Promise<void> | void;
  onPing(): Promise<void> | void;
  onReset(): Promise<void> | void;
  /** Returns `'saved'` when a replay was downloaded, `'none'` when there is no finished live run. */
  onSave(): 'saved' | 'none';
  onGoStage(): void;
  onDismissError(): void;
}

/** The ops page body. Pure on its props, so `/lab/panels` can render it against fixtures. */
export function OpsView(props: OpsViewProps) {
  const { operator, preflight, pending, deployment } = props;
  const steps = useMemo(
    () => deriveSteps({ operatorAddress: operator.address, preflight }),
    [operator.address, preflight],
  );
  const stateOf = (id: StepId): 'done' | 'current' | 'todo' =>
    steps.done[id] ? 'done' : steps.current === id ? 'current' : 'todo';
  const primaryIf = (id: StepId) => (steps.current === id ? 'primary' : 'secondary');

  return (
    <div className={s.page}>
      <main className={s.main}>
        <header className={s.head}>
          <h1 className={s.wordmark}>{copy.brand.name}</h1>
          <div>
            <h2 className={s.title}>{copy.ops.title}</h2>
            <p className={s.lead}>{copy.ops.lead}</p>
          </div>
          <Link className={s.back} href="/">
            {copy.ops.back}
          </Link>
        </header>

        <ol className={s.stepper} aria-label={copy.ops.title}>
          {STEP_ORDER.map((id, i) => (
            <li key={id} className={`${s.pip} ${s[stateOf(id)]}`} aria-current={steps.current === id ? 'step' : undefined}>
              <span className={s.pipNum} aria-hidden="true">
                {stateOf(id) === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <span className={s.pipLabel}>
                {stateOf(id) === 'done' ? copy.ops.steps[id].done : copy.ops.steps[id].label}
              </span>
            </li>
          ))}
        </ol>

        {props.error ? <ErrorSlip error={props.error} onDismiss={props.onDismissError} /> : null}

        <StepCard n={1} id="key" state={stateOf('key')}>
          <KeyStep {...props} primary={primaryIf('key')} />
        </StepCard>

        <StepCard n={2} id="network" state={stateOf('network')}>
          <NetworkStep {...props} primary={primaryIf('network')} keyLoaded={steps.done.key} networkDone={steps.done.network} />
        </StepCard>

        <StepCard n={3} id="fund" state={stateOf('fund')}>
          <p className={s.body}>{copy.ops.stepBody.fund}</p>
          <ChecksList checks={checksForStep(preflight, 'fund')} empty={steps.done.key} busy={pending.preflight} />
          {!deployment.deployed ? <p className={s.warnNote}>{copy.ops.deployHint}</p> : null}
          <div className={s.actions}>
            <Button
              kind={primaryIf('fund')}
              pending={pending.funding}
              pendingLabel={copy.ops.actions.funding}
              disabled={operator.address === null || !deployment.deployed}
              disabledReason={operator.address === null ? copy.ops.actions.needKey : copy.ops.actions.needDeployment}
              onClick={() => void props.onFund()}
            >
              {copy.ops.actions.fund}
            </Button>
          </div>
          <p className={s.hint}>{copy.ops.actions.fundHint}</p>
        </StepCard>

        <StepCard n={4} id="stage" state={steps.current === 'stage' ? 'current' : 'todo'}>
          <p className={s.body}>{steps.canGo ? copy.ops.stepBody.stage : copy.ops.go.blocked}</p>
          <div className={s.actions}>
            <Button
              kind={primaryIf('stage')}
              disabled={!steps.canGo}
              disabledReason={copy.ops.go.blocked}
              onClick={props.onGoStage}
              size="lg"
            >
              {copy.ops.go.stage}
            </Button>
            {!steps.canGo ? (
              <Button kind="secondary" onClick={props.onGoStage} title={copy.ops.go.anywayHint}>
                {copy.ops.go.anyway}
              </Button>
            ) : null}
          </div>
          {!steps.canGo ? <p className={s.hint}>{copy.ops.go.anywayHint}</p> : null}
        </StepCard>

        <PreflightSection {...props} networkCurrent={steps.current === 'network'} />
        <BankActions {...props} />

        <footer className={s.foot}>
          <dl className={s.footList}>
            <div>
              <dt>{copy.ops.footer.build}</dt>
              <dd>
                <code>{props.buildId}</code>
              </dd>
            </div>
            <div>
              <dt>{copy.ops.footer.deployment}</dt>
              <dd>
                {deployment.runBank ? (
                  <>
                    <Address address={deployment.runBank} label={copy.proof.bank} />{' '}
                    {deployment.street ? <Address address={deployment.street} label={copy.proof.street} /> : null}
                  </>
                ) : (
                  copy.ops.footer.notDeployed
                )}
              </dd>
            </div>
            <div>
              <dt>{copy.proof.ausd}</dt>
              <dd>
                <Address address={deployment.ausd} />
              </dd>
            </div>
            <div>
              <dt>{copy.generic.block}</dt>
              <dd>{copy.ops.footer.chain}</dd>
            </div>
          </dl>
        </footer>
      </main>
    </div>
  );
}

function StepCard(props: { n: number; id: StepId; state: 'done' | 'current' | 'todo'; children: React.ReactNode }) {
  const labelId = useId();
  return (
    <section className={`${s.card} ${s[`card_${props.state}`]}`} aria-labelledby={labelId} data-step={props.id} data-state={props.state}>
      <header className={s.cardHead}>
        <span className={s.stepTag}>{copy.ops.stepWord(props.n)}</span>
        <h3 id={labelId} className={s.cardTitle}>
          {props.state === 'done' ? copy.ops.steps[props.id].done : copy.ops.steps[props.id].label}
        </h3>
        <span className={`${s.stateTag} ${s[`tag_${props.state}`]}`}>{copy.ops.stepState[props.state]}</span>
      </header>
      <div className={s.cardBody}>{props.children}</div>
    </section>
  );
}

function ErrorSlip(props: { error: UiError; onDismiss(): void }) {
  return (
    <div className={s.errorSlip} role="alert">
      <div>
        <strong>{props.error.title}</strong>
        <p>{props.error.detail}</p>
      </div>
      <Button kind="secondary" onClick={props.onDismiss}>
        {copy.buttons.dismiss}
      </Button>
    </div>
  );
}

// ── Step 1: keys ──────────────────────────────────────────────────────────
function KeyStep(props: OpsViewProps & { primary: 'primary' | 'secondary' }) {
  const { operator } = props;
  const [primaryKey, setPrimaryKey] = useState('');
  const [backupKey, setBackupKey] = useState('');
  const [rpc, setRpc] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const ids = { p: useId(), b: useId(), r: useId() };

  const check = checkKeys(primaryKey, backupKey);
  const rpcCheck = checkRpc(rpc);
  const reason = (c: ReturnType<typeof checkKeys>['primary'] | null, which: 'p' | 'b'): string | null => {
    if (!touched || c === null || c.ok) return null;
    if (c.reason === 'address') return copy.ops.key.address;
    if (c.reason === 'empty') return which === 'p' ? copy.ops.key.invalid : null;
    return which === 'p' ? copy.ops.key.invalid : copy.ops.key.invalidBackup;
  };
  const pErr = reason(check.primary, 'p');
  const bErr = reason(check.backup, 'b') ?? (touched && check.sameKey ? copy.ops.key.sameKey : null);
  const rErr = touched && !rpcCheck.ok ? copy.ops.key.rpcInvalid : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!check.ok || !check.primary.ok || !rpcCheck.ok) return;
    setBusy(true);
    try {
      await props.onLoadKeys({
        primary: check.primary.hex,
        backup: check.backup && check.backup.ok ? check.backup.hex : null,
        rpcOverride: rpcCheck.url,
      });
      // The keys now live in sessionStorage (controller). Don't keep them in React state.
      setPrimaryKey('');
      setBackupKey('');
      setTouched(false);
    } finally {
      setBusy(false);
    }
  };

  const keyForm = (
    <form className={s.form} onSubmit={submit} noValidate autoComplete="off">
        <div className={s.field}>
          <label htmlFor={ids.p}>{copy.ops.key.primary}</label>
          <input
            id={ids.p}
            className={s.input}
            type={show ? 'text' : 'password'}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            placeholder="0x…"
            value={primaryKey}
            onChange={(e) => setPrimaryKey(e.target.value)}
            aria-invalid={pErr ? true : undefined}
            aria-describedby={`${ids.p}-h`}
          />
          <span id={`${ids.p}-h`} className={pErr ? s.fieldErr : s.fieldHint}>
            {pErr ?? copy.ops.key.primaryHint}
          </span>
        </div>
        <div className={s.field}>
          <label htmlFor={ids.b}>{copy.ops.key.backup}</label>
          <input
            id={ids.b}
            className={s.input}
            type={show ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            placeholder="0x…"
            value={backupKey}
            onChange={(e) => setBackupKey(e.target.value)}
            aria-invalid={bErr ? true : undefined}
            aria-describedby={bErr ? `${ids.b}-h` : undefined}
          />
          {bErr ? (
            <span id={`${ids.b}-h`} className={s.fieldErr}>
              {bErr}
            </span>
          ) : null}
        </div>
        <div className={s.field}>
          <label htmlFor={ids.r}>{copy.ops.key.rpc}</label>
          <input
            id={ids.r}
            className={s.input}
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…"
            value={rpc}
            onChange={(e) => setRpc(e.target.value)}
            aria-invalid={rErr ? true : undefined}
            aria-describedby={`${ids.r}-h`}
          />
          <span id={`${ids.r}-h`} className={rErr ? s.fieldErr : s.fieldHint}>
            {rErr ?? copy.ops.key.rpcHint}
          </span>
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          {show ? copy.ops.key.hide : copy.ops.key.show}
        </label>
        <p className={s.hint}>{copy.ops.key.stored}</p>
        <div className={s.actions}>
          <Button kind={operator.address ? 'secondary' : props.primary} type="submit" pending={busy} pendingLabel={copy.ops.key.loading} onClick={() => {}}>
            {copy.ops.key.load}
          </Button>
        </div>
    </form>
  );

  return (
    <>
      <p className={s.body}>{copy.ops.stepBody.key}</p>
      <p className={s.warnNote}>{copy.ops.key.warning}</p>

      {operator.address ? (
        <dl className={s.kv}>
          <div>
            <dt>{copy.ops.key.operator}</dt>
            <dd>
              <Address address={operator.address} />
              <span className={`${s.mono} tnum`}>
                {' '}
                · {operator.balanceWei !== null ? fmtMon(operator.balanceWei) : copy.ops.key.balanceUnknown} ({copy.ops.key.testnetOnly})
              </span>
            </dd>
          </div>
          {operator.backupAddress ? (
            <div>
              <dt>{copy.ops.key.backupLabel}</dt>
              <dd>
                <Address address={operator.backupAddress} />
                {operator.usingBackup ? <span> · {copy.ops.key.usingBackup}</span> : null}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="srOnly">{copy.ops.key.loaded}</dt>
            <dd className={s.muted}>{props.keySource === 'env' ? copy.ops.key.fromEnv : copy.ops.key.fromSession}</dd>
          </div>
        </dl>
      ) : (
        <p className={s.muted}>{copy.ops.key.none}</p>
      )}

      {operator.address ? (
        <div className={s.actions}>
          <Button kind="secondary" onClick={props.onForget}>
            {copy.ops.key.forget}
          </Button>
        </div>
      ) : null}

      {operator.address ? (
        <details className={s.more}>
          <summary>{copy.ops.key.change}</summary>
          {keyForm}
        </details>
      ) : (
        keyForm
      )}
    </>
  );
}


// ── Step 2: network ───────────────────────────────────────────────────────
function NetworkStep(props: OpsViewProps & { primary: 'primary' | 'secondary'; keyLoaded: boolean; networkDone: boolean }) {
  const [rpc, setRpc] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const rpcCheck = checkRpc(rpc);
  const checks = checksForStep(props.preflight, 'network');

  const reconnect = async () => {
    if (!rpcCheck.ok) return;
    setBusy(true);
    try {
      await props.onReconnectRpc(rpcCheck.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className={s.body}>{copy.ops.stepBody.network}</p>
      <ChecksList checks={checks} empty={props.keyLoaded} busy={props.pending.preflight} />
      <div className={s.actions}>
        <Button
          kind={props.primary}
          pending={props.pending.preflight}
          pendingLabel={copy.ops.preflight.running}
          disabled={!props.keyLoaded}
          disabledReason={copy.ops.actions.needKey}
          onClick={() => void props.onRecheck()}
        >
          {copy.ops.preflight.run}
        </Button>
      </div>
      {props.keyLoaded && !props.networkDone ? (
        <div className={s.inline}>
          <div className={s.field}>
            <label htmlFor={id}>{copy.ops.key.rpc}</label>
            <input
              id={id}
              className={s.input}
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…"
              value={rpc}
              onChange={(e) => setRpc(e.target.value)}
              aria-invalid={!rpcCheck.ok || undefined}
            />
            <span className={rpcCheck.ok ? s.fieldHint : s.fieldErr}>{rpcCheck.ok ? copy.ops.key.rpcHint : copy.ops.key.rpcInvalid}</span>
          </div>
          <Button
            kind="secondary"
            pending={busy}
            pendingLabel={copy.ops.key.rpcApplying}
            disabled={!rpcCheck.ok || rpc.trim() === ''}
            onClick={() => void reconnect()}
          >
            {copy.ops.key.rpcApply}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ── Preflight checklist ───────────────────────────────────────────────────
function ChecksList(props: { checks: PreflightCheck[]; empty: boolean; busy: boolean }) {
  if (props.checks.length === 0) {
    return <p className={s.muted}>{props.busy ? copy.ops.preflight.running : props.empty ? copy.ops.preflight.empty : copy.ops.key.none}</p>;
  }
  return (
    <ul className={s.checks} aria-busy={props.busy || undefined}>
      {props.checks.map((c) => (
        <li key={c.id} className={`${s.checkRow} ${s[`ck_${c.status}`]}`} data-status={c.status}>
          <span className={s.ckIcon} aria-hidden="true">
            {c.status === 'pass' ? <CheckIcon /> : c.status === 'pending' ? '…' : c.status === 'warn' ? '!' : <CrossIcon />}
          </span>
          <span className={s.ckText}>
            <span className={s.ckLabel}>
              {c.label}
              <span className={s.ckWord}>
                {copy.ops.preflight[c.status]}
                {c.critical ? '' : ` · ${copy.ops.preflight.optional}`}
              </span>
            </span>
            {c.detail ? <span className={s.ckDetail}>{c.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PreflightSection(props: OpsViewProps & { networkCurrent: boolean }) {
  const { preflight } = props;
  const failing = preflight ? preflight.checks.filter((c) => c.critical && c.status === 'fail').length : 0;
  return (
    <section className={s.card} aria-labelledby="ops-pf">
      <header className={s.cardHead}>
        <h3 id="ops-pf" className={s.cardTitle}>
          {copy.ops.preflight.title}
        </h3>
        {preflight ? (
          <span className={`${s.stateTag} ${preflight.ok ? s.tag_done : s.tag_bad}`}>
            {preflight.ok ? copy.ops.preflight.summaryOk : copy.ops.preflight.summaryBad(failing)}
          </span>
        ) : null}
      </header>
      <div className={s.cardBody}>
        <ChecksList checks={preflight?.checks ?? []} empty={props.operator.address !== null} busy={props.pending.preflight} />
        {preflight ? <p className={s.hint}>{copy.ops.preflight.lastRun(fmtRecorded(new Date(preflight.at).toISOString()))}</p> : null}
        {!props.networkCurrent ? (
          <div className={s.actions}>
            <Button
              kind="secondary"
              pending={props.pending.preflight}
              pendingLabel={copy.ops.preflight.running}
              disabled={props.operator.address === null}
              disabledReason={copy.ops.actions.needKey}
              onClick={() => void props.onRecheck()}
            >
              {copy.ops.preflight.run}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ── Bank actions ──────────────────────────────────────────────────────────
function BankActions(props: OpsViewProps) {
  const { operator, pending, deployment } = props;
  const [saveNote, setSaveNote] = useState<'saved' | 'none' | null>(null);
  const noKey = operator.address === null;
  const blocked = noKey || !deployment.deployed;
  const why = noKey ? copy.ops.actions.needKey : copy.ops.actions.needDeployment;
  return (
    <section className={s.card} aria-labelledby="ops-actions">
      <header className={s.cardHead}>
        <h3 id="ops-actions" className={s.cardTitle}>
          {copy.ops.actions.title}
        </h3>
      </header>
      <div className={`${s.cardBody} ${s.actionGrid}`}>
        <div className={s.actionItem}>
          <Button
            kind="secondary"
            pending={pending.pinging}
            pendingLabel={copy.ops.actions.pinging}
            disabled={blocked}
            disabledReason={why}
            onClick={() => void props.onPing()}
          >
            {copy.ops.actions.ping}
          </Button>
          <p className={s.hint}>{copy.ops.actions.pingHint}</p>
        </div>
        <div className={s.actionItem}>
          <Button
            kind="secondary"
            pending={pending.resetting}
            pendingLabel={copy.ops.actions.resetting}
            disabled={blocked}
            disabledReason={why}
            onClick={() => void props.onReset()}
          >
            {copy.ops.actions.reset}
          </Button>
          <p className={s.hint}>{copy.ops.actions.resetHint}</p>
        </div>
        <div className={s.actionItem}>
          <Button kind="secondary" onClick={() => setSaveNote(props.onSave())}>
            {copy.ops.actions.save}
          </Button>
          <p className={s.hint} role="status">
            {saveNote === 'saved' ? copy.ops.actions.saved : saveNote === 'none' ? copy.ops.actions.saveNone : copy.ops.actions.saveHint}
          </p>
        </div>
      </div>
    </section>
  );
}
