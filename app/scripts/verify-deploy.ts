// Post-deploy verification (PRD §15.3, BACKLOG F-11).
//   pnpm verify:deploy https://run-bank-run.vercel.app [--expect-build <git short sha>]
// Keys are read from the environment (`--env-file=.env.local` via the npm script) and are only used to prove they are
// NOT in the deployed JavaScript. They are never printed.
const base = (process.argv[2] ?? '').replace(/\/+$/, '');
const expectIdx = process.argv.indexOf('--expect-build');
const expectBuild = expectIdx > 0 ? process.argv[expectIdx + 1] : null;
if (!/^https:\/\/|^http:\/\/localhost/.test(base)) {
  console.error('Usage: pnpm verify:deploy https://<project>.vercel.app [--expect-build <sha>]');
  process.exit(2);
}

let failed = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => {
  failed += 1;
  console.log(`  ✗ ${m}`);
};

async function get(path: string): Promise<{ status: number; text: string; type: string }> {
  const res = await fetch(base + path, { redirect: 'follow' });
  return { status: res.status, text: await res.text(), type: res.headers.get('content-type') ?? '' };
}

async function main() {
  console.log(`Verifying ${base}`);

  console.log('Routes return 200 and the SPA shell');
  let indexHtml = '';
  for (const path of ['/', '/app', '/watch', '/replay', '/replay/does-not-exist', '/ops']) {
    const r = await get(path);
    if (r.status === 200 && r.text.includes('<div id="root">')) ok(`${path} → 200`);
    else bad(`${path} → ${r.status}`);
    if (path === '/') indexHtml = r.text;
  }

  console.log('Metadata');
  const title = indexHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  if (title && !/vite|react/i.test(title)) ok(`title: ${title}`);
  else bad(`title is "${title}"`);
  const og = indexHtml.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? '';
  if (/^https?:\/\//.test(og)) {
    try {
      const r = await fetch(og);
      if (r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('image/')) ok(`og:image ${og} → 200`);
      else bad(`og:image ${og} → ${r.status} ${r.headers.get('content-type')}`);
    } catch {
      bad(`og:image ${og} is unreachable`);
    }
  } else {
    bad(`og:image is not an absolute https URL ("${og}")`);
  }
  if (/vite\.svg/.test(indexHtml)) bad('favicon still references vite.svg');

  console.log('JavaScript bundle');
  const chunks = [...new Set([...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]))];
  if (chunks.length === 0) bad('no JS chunks found in index.html');
  let js = '';
  for (const c of chunks) js += (await get(c)).text;
  // Lazily loaded chunks are referenced from the entry chunk: fetch those too.
  const lazy = [...new Set([...js.matchAll(/["'`]\.?\/?([A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js)["'`]/g)].map((m) => `/assets/${m[1]}`))];
  for (const c of lazy.filter((c) => !chunks.includes(c))) {
    const r = await get(c);
    if (r.status === 200) js += r.text;
  }
  ok(`scanned ${chunks.length + lazy.length} chunk reference(s), ${(js.length / 1024).toFixed(0)} kB`);

  const secrets = [process.env.VITE_OPERATOR_PK, process.env.VITE_BACKUP_PK]
    .filter((k): k is string => !!k && k.length >= 64)
    .map((k) => k.replace(/^0x/i, '').toLowerCase());
  if (secrets.length === 0) console.log('  · no local keys in the environment; run with --env-file=.env.local to also check for them');
  for (const [i, s] of secrets.entries()) {
    if (js.toLowerCase().includes(s)) bad(`KEY ${i === 0 ? 'operator' : 'backup'} FOUND IN THE DEPLOYED BUNDLE`);
    else ok(`${i === 0 ? 'operator' : 'backup'} key not in the bundle`);
  }
  if (/VITE_(OPERATOR|BACKUP)_PK/.test(js) && /0x[0-9a-fA-F]{64}/.test(js.match(/VITE_(OPERATOR|BACKUP)_PK.{0,80}/)?.[0] ?? '')) {
    bad('a 32-byte hex literal sits next to a *_PK name in the bundle');
  }

  console.log('Build id');
  const idMatch = js.match(/\b([0-9a-f]{7,9}|nogit)-(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  if (idMatch) {
    ok(`build id ${idMatch[0]}`);
    if (expectBuild && !idMatch[1].startsWith(expectBuild) && !expectBuild.startsWith(idMatch[1])) bad(`expected build ${expectBuild}`);
    else if (expectBuild) ok(`matches expected ${expectBuild}`);
  } else {
    bad('no build id found in the bundle (is E showing __BUILD_ID__ on /ops?)');
  }

  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify-deploy crashed:', e instanceof Error ? e.message : e);
  process.exit(2);
});
