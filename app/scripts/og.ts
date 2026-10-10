// `pnpm og`: renders the 1200×630 social card to app/public/og.png (PRD §13.3 rule 8).
//
// Why headless Chrome and not resvg: the brand faces ship from @fontsource as woff2 only, and resvg loads
// ttf/otf only. Chrome reads the same woff2 files, so the card uses the real Big Shoulders, Atkinson and Tiro
// faces and the same turbulence filter as the in-app stamp. Set CHROME_PATH if Chrome is not in a standard place.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rosetteSvg, toDataUri, wavesSvg } from '@/ui/brand/guilloche';
import { copy } from '@/ui/copy';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'og.png');

const W = 1200;
const H = 630;

function font(pkg: string, file: string): string {
  const p = join(root, 'node_modules', pkg, 'files', file);
  if (!existsSync(p)) throw new Error(`Missing font file ${p}. Run pnpm install.`);
  return `data:font/woff2;base64,${readFileSync(p).toString('base64')}`;
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error('No Chrome or Chromium found. Install one or set CHROME_PATH.');
  return hit;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ogHtml(): string {
  const display = font('@fontsource-variable/big-shoulders-display', 'big-shoulders-display-latin-wght-normal.woff2');
  const body = font('@fontsource-variable/atkinson-hyperlegible-next', 'atkinson-hyperlegible-next-latin-wght-normal.woff2');
  const marathi = font('@fontsource/tiro-devanagari-marathi', 'tiro-devanagari-marathi-devanagari-400-normal.woff2');
  const rosette = toDataUri(rosetteSvg());
  const waves = toDataUri(wavesSvg());
  const b = copy.brand;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(b.title)}</title>
<style>
@font-face{font-family:'Display';src:url(${display}) format('woff2');font-weight:100 900}
@font-face{font-family:'Body';src:url(${body}) format('woff2');font-weight:200 800}
@font-face{font-family:'Marathi';src:url(${marathi}) format('woff2');font-weight:400}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{position:relative;background:#E4ECE6;color:#172033;font-family:'Body',sans-serif}
.waves{position:absolute;left:0;right:0;top:0;height:120px;background:${waves} 0 0/100% 100% no-repeat;
  -webkit-mask-image:linear-gradient(#000,rgb(0 0 0/.5) 60%,transparent)}
.rosette{position:absolute;width:560px;height:560px;background:${rosette} 0 0/100% 100% no-repeat;
  -webkit-mask-image:radial-gradient(circle,#000 40%,transparent 72%)}
.tl{left:-330px;top:-330px}
.br{right:-340px;bottom:-340px}
.kicker{position:absolute;left:64px;top:52px;font-size:30px;font-weight:700;color:#3F4A5C;letter-spacing:.01em}
.stage{position:absolute;left:0;right:0;top:112px;display:flex;justify-content:center}
.ink{font-size:156px;color:#5B3FD6;mix-blend-mode:multiply;transform:rotate(-7deg);filter:url(#ink)}
.rect{padding:.035em;border:.05em solid currentColor;border-radius:.03em}
.inner{display:grid;justify-items:center;gap:.02em;padding:.05em .17em .07em;border:.016em solid currentColor;border-radius:.012em}
.head{font-family:'Display';font-weight:900;font-size:1em;line-height:.86;letter-spacing:.012em;white-space:nowrap;padding-top:.04em}
.mr{font-family:'Marathi';font-size:.2em;line-height:1.2;letter-spacing:.03em}
.sub{font-family:'Display';font-weight:800;font-size:.2em;line-height:1.1;letter-spacing:.08em;white-space:nowrap}
.foot{position:absolute;left:64px;right:64px;bottom:34px}
.row{display:flex;align-items:baseline;gap:20px;white-space:nowrap}
.mark{font-family:'Display';font-weight:900;font-size:76px;line-height:.9;color:#5B3FD6;letter-spacing:.01em}
.line{font-size:36px;font-weight:700}
.note{margin-top:8px;font-size:21px;font-weight:600;color:#566170}
</style></head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="ink" x="-6%" y="-8%" width="112%" height="116%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="11" result="warp"/>
<feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G" result="rough"/>
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="grain"/>
<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -16 0 11.6" result="speckle"/>
<feComposite in="rough" in2="speckle" operator="in"/></filter></svg>
<div class="waves"></div><div class="rosette tl"></div><div class="rosette br"></div>
<div class="kicker">${esc(b.ogKicker)}</div>
<div class="stage"><div class="ink"><div class="rect"><div class="inner">
  <div class="head">${esc(b.ogStamp)}</div>
  <div class="mr" lang="mr">${esc(copy.stamp.failed.marathi)}</div>
  <div class="sub">${esc(b.ogStampSub)}</div>
</div></div></div></div>
<div class="foot"><div class="row"><span class="mark">${esc(b.name)}</span><span class="line">${esc(b.ogLine)}</span></div><div class="note">${esc(b.ogFootnote)}</div></div>
</body></html>`;
}

function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('Chrome did not write a PNG.');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function main(): void {
  const chrome = findChrome();
  const dir = mkdtempSync(join(tmpdir(), 'run-og-'));
  const htmlPath = join(dir, 'og.html');
  writeFileSync(htmlPath, ogHtml());
  try {
    const res = spawnSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${W},${H}`,
        '--virtual-time-budget=4000',
        `--user-data-dir=${join(dir, 'profile')}`,
        `--screenshot=${out}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60_000 },
    );
    if (res.status !== 0 || !existsSync(out)) {
      throw new Error(`Chrome failed (exit ${res.status}): ${res.stderr?.toString().slice(-400) ?? ''}`);
    }
    const { w, h } = pngSize(out);
    if (w !== W || h !== H) throw new Error(`og.png is ${w}×${h}, expected ${W}×${H}.`);
    console.log(`wrote ${out} (${w}×${h}, ${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
