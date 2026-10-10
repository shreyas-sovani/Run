import type { CSSProperties } from 'react';
import { guillocheUris } from './guilloche';
import s from './PaperBackground.module.css';

/**
 * Cheque security paper (PRD §14.7): a guilloche rosette in two corners and wave lines under the top bar,
 * in --guilloche on --paper. Never behind the network's centre or behind text. Decorative only.
 */
export function PaperBackground() {
  const { rosette, waves } = guillocheUris();
  const style = { '--rosette': rosette, '--waves': waves } as CSSProperties;
  return (
    <div className={s.root} style={style} aria-hidden="true" data-testid="paper-background">
      <div className={s.waves} />
      <div className={`${s.rosette} ${s.topLeft}`} />
      <div className={`${s.rosette} ${s.bottomRight}`} />
    </div>
  );
}
