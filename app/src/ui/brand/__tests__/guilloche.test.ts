import { describe, expect, it } from 'vitest';
import { rosetteSvg, wavesSvg } from '@/ui/brand/guilloche';

describe('guilloche', () => {
  it('is deterministic', () => {
    expect(rosetteSvg()).toBe(rosetteSvg());
    expect(wavesSvg()).toBe(wavesSvg());
  });
  it('uses only the guilloche colour and stays small enough for a data URI', () => {
    const svg = rosetteSvg();
    expect(svg).toContain('#C5D5CB');
    expect(svg.length).toBeLessThan(250_000);
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
