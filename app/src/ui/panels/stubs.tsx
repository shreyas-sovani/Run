// Placeholder from F-00. Owner: E. Replace freely.
import { useRunView } from '@/app/store';

export function ProofPanel(props: { open: boolean; onClose(): void }) {
  const seals = useRunView((v) => v.seals.length);
  if (!props.open) return null;
  return (
    <aside style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 360, background: '#fff', padding: 16 }}>
      <button type="button" onClick={props.onClose}>Close</button>
      <div>Proof panel (placeholder). Seals: {seals}</div>
    </aside>
  );
}

export function OpsPage() {
  return <div style={{ padding: 24 }}>Ops page (placeholder). Owner: E. Build: {__BUILD_ID__}</div>;
}

export function ReplayPicker() {
  return <div style={{ padding: 24 }}>Replay picker (placeholder). Owner: E.</div>;
}

export function ModeBanner() {
  const mode = useRunView((v) => v.mode);
  if (mode === 'live') return null;
  return <div style={{ padding: 8, background: 'var(--seal)', color: '#fff' }}>Mode banner (placeholder): {mode}</div>;
}

export function PanelsLab() {
  return <div style={{ padding: 24 }}>Panels lab (placeholder). Owner: E.</div>;
}
