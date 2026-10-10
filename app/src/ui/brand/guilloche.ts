// Deterministic guilloche generator (PRD §14.7). Pure maths, no randomness: the paper looks
// identical on every machine and every reload. Output is SVG markup; PaperBackground wraps it in a data URI once.

const f2 = (n: number): string => (Math.round(n * 100) / 100).toString();

export interface RosetteOptions {
  /** Outer radius in viewBox units. */
  radius?: number;
  /** Number of lobes per curve. */
  lobes?: number;
  /** Number of overlaid curves (more = denser moiré). */
  curves?: number;
  /** Points per curve. */
  steps?: number;
}

/** A cheque-style rosette: rotated, phase-shifted lobed curves that interfere into a moiré. */
export function rosettePaths(opts: RosetteOptions = {}): string[] {
  const R = opts.radius ?? 300;
  const lobes = opts.lobes ?? 14;
  const curves = opts.curves ?? 30;
  const steps = opts.steps ?? 220;
  const paths: string[] = [];
  for (let k = 0; k < curves; k++) {
    const phase = (k / curves) * ((2 * Math.PI) / lobes) * 2;
    const depth = 0.1 + 0.16 * (k / curves); // each curve breathes a little more than the last
    const inner = 0.52 + 0.4 * (k / curves);
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const wobble = Math.sin(lobes * t + phase) + 0.35 * Math.sin((lobes * 2 + 1) * t - phase * 2);
      const r = R * inner * (1 + depth * wobble);
      const x = R + r * Math.cos(t);
      const y = R + r * Math.sin(t);
      d += `${i === 0 ? 'M' : 'L'}${f2(x)} ${f2(y)}`;
    }
    paths.push(`${d}Z`);
  }
  return paths;
}

/** Fine wave lines: a band of sine curves with drifting phase, like the border of a banknote. */
export function wavePaths(width = 1200, height = 120, lines = 16, steps = 120): string[] {
  const paths: string[] = [];
  for (let k = 0; k < lines; k++) {
    const u = k / (lines - 1);
    const baseline = height * (0.12 + 0.76 * u);
    const amp = height * (0.05 + 0.05 * Math.sin(u * Math.PI));
    const cycles = 5 + u * 1.5;
    const phase = u * Math.PI * 1.3;
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y =
        baseline + amp * Math.sin((i / steps) * cycles * 2 * Math.PI + phase) + amp * 0.4 * Math.sin((i / steps) * cycles * 5 * Math.PI - phase);
      d += `${i === 0 ? 'M' : 'L'}${f2(x)} ${f2(y)}`;
    }
    paths.push(d);
  }
  return paths;
}

const STROKE = '#C5D5CB'; // --guilloche (data URIs cannot read CSS variables)

export function rosetteSvg(opts: RosetteOptions = {}): string {
  const R = opts.radius ?? 300;
  const paths = rosettePaths(opts)
    .map((d) => `<path d="${d}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${R * 2} ${R * 2}" fill="none" stroke="${STROKE}" stroke-width="1.1" stroke-linejoin="round">${paths}</svg>`;
}

export function wavesSvg(width = 1200, height = 120): string {
  const paths = wavePaths(width, height)
    .map((d) => `<path d="${d}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" fill="none" stroke="${STROKE}" stroke-width="1.2" vector-effect="non-scaling-stroke">${paths}</svg>`;
}

export function toDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

let cache: { rosette: string; waves: string } | null = null;

/** Generated once per page load. */
export function guillocheUris(): { rosette: string; waves: string } {
  cache ??= { rosette: toDataUri(rosetteSvg()), waves: toDataUri(wavesSvg()) };
  return cache;
}
