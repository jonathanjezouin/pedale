import { describe, expect, it } from 'vitest';
import { distance, duree, ecartSelonUnite, kmh, pourcent, texteCadre, valeurSelonUnite, watts } from '../src/format.ts';

// toLocaleString met une espace insécable fine ou normale selon l'environnement : on la normalise.
const n = (s: string): string => s.replace(/[  ]/g, ' ');

describe('mise en forme (SI -> affichage)', () => {
  it('convertit m/s en km/h, ratio en %, watts', () => {
    expect(n(kmh(10))).toBe('36,0 km/h');
    expect(n(pourcent(0.984))).toBe('98 %');
    expect(n(watts(224.6))).toBe('225 W');
  });
  it('distances et durées', () => {
    expect(n(distance(950))).toBe('950 m');
    expect(n(distance(99_500))).toBe('99,5 km');
    expect(duree(9_950)).toBe('2 h 46 min');
    expect(duree(75)).toBe('1 min 15 s');
  });
  it('perçu/réel selon l’unité', () => {
    expect(n(valeurSelonUnite(10, 'm/s'))).toBe('36,0 km/h');
    expect(n(valeurSelonUnite(0.5, 'ratio'))).toBe('50 %');
    expect(ecartSelonUnite({ grandeur: 'vitesse', unite: 'm/s', percu: 10, reel: 10 })).toBe('aucun');
    expect(n(ecartSelonUnite({ grandeur: 'vitesse', unite: 'm/s', percu: 11, reel: 10 }))).toBe('+3,6 km/h');
  });
  it('décrit un cadre en mots', () => {
    expect(n(texteCadre([{ grandeur: 'puissanceVisee_w', min: 0, max: 288 }]))).toBe('puissance entre 0 W et 288 W');
    expect(n(texteCadre([{ grandeur: 'puissanceVisee_w', min: null, max: 288 }]))).toBe('puissance ≤ 288 W');
    expect(texteCadre([])).toBe('aucun cadre imposé');
  });
});
