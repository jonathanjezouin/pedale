import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';

const suite = (graine: number, n = 20): number[] => {
  const a = creerAlea(graine);
  return Array.from({ length: n }, () => a.suivant());
};

describe('générateur seedé', () => {
  it('donne la même suite à seed identique', () => {
    expect(suite(42)).toEqual(suite(42));
  });
  it('donne des suites différentes à seeds différentes', () => {
    expect(suite(1)).not.toEqual(suite(2));
  });
  it('reste dans [0, 1)', () => {
    for (const x of suite(7, 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
