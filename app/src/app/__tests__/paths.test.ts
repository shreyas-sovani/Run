import { describe, expect, it } from 'vitest';
import { PATHS, isStageRoute, navSectionOf } from '@/app/paths';

describe('isStageRoute', () => {
  it('is true only where the stage renders', () => {
    for (const p of ['/app', '/app/', '/watch', '/replay/bhaus-w-failed-202610100809', '/lab/stage']) {
      expect(isStageRoute(p), p).toBe(true);
    }
    for (const p of ['/', '/replay', '/replay/', '/ops', '/lab/brand', '/lab/panels', '/nope']) {
      expect(isStageRoute(p), p).toBe(false);
    }
  });
});

describe('navSectionOf', () => {
  it('maps every app route to its nav section and the rest to null', () => {
    expect(navSectionOf('/app')).toBe('app');
    expect(navSectionOf('/watch')).toBe('watch');
    expect(navSectionOf('/replay')).toBe('replays');
    expect(navSectionOf('/replay/x')).toBe('replays');
    expect(navSectionOf('/ops/')).toBe('ops');
    expect(navSectionOf('/')).toBeNull();
    expect(navSectionOf('/lab/stage')).toBeNull();
  });
});

describe('PATHS', () => {
  it('encodes replay ids', () => {
    expect(PATHS.replay('a b')).toBe('/replay/a%20b');
  });
});
