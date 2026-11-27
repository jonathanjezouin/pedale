import { describe, expect, it } from 'vitest';
import {
  altitude, capDegres, courbureLisible, distance, duree, ecartSelonUnite, kmh, largeurRoute, penteSignee, pourcent, positionKm, texteCadre,
  valeurSelonUnite, watts,
} from '../src/format.ts';

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

describe('mise en forme de la vue Étape', () => {
  it('pente signée : signe, une décimale, pas de signe pour une pente nulle', () => {
    expect(n(penteSignee(0.052))).toBe('+5,2 %');
    expect(n(penteSignee(-0.08))).toBe('−8,0 %');
    expect(n(penteSignee(0))).toBe('0,0 %');
    expect(n(penteSignee(0.0003))).toBe('0,0 %'); // 0,03 % s'arrondit à 0,0 : pas de signe trompeur
    expect(n(penteSignee(-0.12))).toBe('−12,0 %');
  });
  it('courbure : ligne droite ou virage avec son côté et son rayon', () => {
    expect(courbureLisible(null, 0)).toBe('ligne droite');
    expect(n(courbureLisible(85, 1 / 85))).toBe('virage à gauche, rayon 85 m');
    expect(n(courbureLisible(150, -1 / 150))).toBe('virage à droite, rayon 150 m');
    expect(n(courbureLisible(2500, 1 / 2500))).toBe('virage à gauche, rayon 2,5 km');
  });
  it('cap, altitude, largeur, position', () => {
    expect(capDegres(0)).toBe('0°');
    expect(capDegres(Math.PI / 2)).toBe('90°');
    expect(capDegres(-Math.PI / 2)).toBe('270°'); // ramené dans [0, 360[
    expect(capDegres(2 * Math.PI + 0.5 * Math.PI)).toBe('90°');
    expect(n(altitude(1234.4))).toBe('1 234 m');
    expect(n(largeurRoute(6.54))).toBe('6,5 m');
    expect(n(positionKm(12345))).toBe('12,35 km');
  });
});
