import { describe, expect, it } from 'vitest';
import { displayUrl, publicBase } from '../closingModel';

describe('publicBase', () => {
  it('prefers a real VITE_PUBLIC_URL and trims trailing slashes', () => {
    expect(publicBase('https://run-bank.vercel.app/', 'http://localhost:4173')).toBe('https://run-bank.vercel.app');
  });
  it('ignores local env values and uses the page origin', () => {
    expect(publicBase('http://localhost:4173', 'https://run-bank.vercel.app')).toBe('https://run-bank.vercel.app');
    expect(publicBase('http://127.0.0.1:4173', 'http://192.168.1.5:4173')).toBe('http://192.168.1.5:4173');
  });
  it('uses the origin when the env value is missing or not a URL', () => {
    expect(publicBase(undefined, 'https://x.app/')).toBe('https://x.app');
    expect(publicBase('  ', 'https://x.app')).toBe('https://x.app');
    expect(publicBase('nonsense', 'https://x.app')).toBe('https://x.app');
  });
});

describe('displayUrl', () => {
  it('drops the scheme', () => {
    expect(displayUrl('https://run-bank.vercel.app/watch')).toBe('run-bank.vercel.app/watch');
    expect(displayUrl('http://localhost:4173/watch')).toBe('localhost:4173/watch');
  });
});
