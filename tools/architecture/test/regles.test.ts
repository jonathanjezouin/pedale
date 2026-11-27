import { describe, expect, it } from 'vitest';
// @ts-expect-error module JavaScript sans déclaration de types
import { verifierDependances, verifierInterdits, verifierUnites } from '../regles.mjs';
// @ts-expect-error module JavaScript sans déclaration de types
import { chargerFichiersReels } from '../charger.mjs';

const f = (chemin: string, contenu: string) => ({ chemin, contenu });

describe('règles de dépendance entre couches', () => {
  it('le code réel passe', () => {
    const fichiers = chargerFichiersReels();
    expect(fichiers.length).toBeGreaterThan(0);
    expect(verifierDependances(fichiers)).toEqual([]);
    expect(verifierInterdits(fichiers)).toEqual([]);
    expect(verifierUnites(fichiers)).toEqual([]);
  });

  it('accepte les imports autorisés', () => {
    expect(
      verifierDependances([
        f('packages/sim/src/monde/a.ts', "import type { X } from '../contrats/index.ts';"),
        f('packages/sim/src/moteur/b.ts', "import { a } from '../monde/a.ts'; import { e } from '../esprit/index.ts';"),
        f('apps/jeu/src/main.ts', "import { creerAlea } from '@pedale/sim'; import 'vite/client';"),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['monde importe esprit', 'packages/sim/src/monde/a.ts', "import { e } from '../esprit/index.ts';"],
    ['esprit importe monde', 'packages/sim/src/esprit/a.ts', "import { m } from '../monde/index.ts';"],
    ['contrats importe monde', 'packages/sim/src/contrats/a.ts', "export * from '../monde/index.ts';"],
    ['import dynamique interdit', 'packages/sim/src/esprit/a.ts', "const m = await import('../monde/index.ts');"],
    ['sim importe l’application', 'packages/sim/src/moteur/a.ts', "import '../../../../apps/jeu/src/main.ts';"],
    ['sim importe une dépendance externe', 'packages/sim/src/monde/a.ts', "import _ from 'lodash';"],
    ['application importe monde (chemin profond)', 'apps/jeu/src/a.ts', "import { m } from '@pedale/sim/src/monde/index.ts';"],
    ['application importe esprit (chemin relatif)', 'apps/jeu/src/a.ts', "import { e } from '../../../packages/sim/src/esprit/index.ts';"],
    ['la porte d’entrée de sim exporte monde', 'packages/sim/src/index.ts', "export * from './monde/index.ts';"],
    ['dossier hors des couches prévues', 'packages/sim/src/divers/a.ts', 'export {};'],
  ])('refuse : %s', (_nom, chemin, contenu) => {
    expect(verifierDependances([f(chemin, contenu)]).length).toBeGreaterThan(0);
  });
});

describe('API interdites dans sim', () => {
  it.each(['Math.random()', 'new Date()', 'Date.now()', 'performance.now()'])('refuse %s', (code) => {
    expect(verifierInterdits([f('packages/sim/src/monde/a.ts', `const x = ${code};`)]).length).toBeGreaterThan(0);
  });
  it('ignore les commentaires et le code hors de sim', () => {
    expect(verifierInterdits([f('packages/sim/src/monde/a.ts', '// pas de Math.random ici\n/* Date */ export {};')])).toEqual([]);
    expect(verifierInterdits([f('apps/jeu/src/a.ts', 'Date.now();')])).toEqual([]);
  });
});

describe('unités dans les contrats', () => {
  const c = (contenu: string) => [f('packages/sim/src/contrats/x.ts', contenu)];
  it('refuse une grandeur sans unité', () => {
    expect(verifierUnites(c('interface A { readonly vitesse: number }')).length).toBe(1);
    expect(verifierUnites(c('interface A { puissance?: number | null }')).length).toBe(1);
    expect(verifierUnites(c('interface A { distance_km: number }')).length).toBe(1);
  });
  it('accepte une grandeur avec unité SI, et ignore le reste', () => {
    expect(
      verifierUnites(c('interface A { readonly vitesse_m_s: number; pente_ratio: number; nb_n: number; nom: string; f(): number }')),
    ).toEqual([]);
    expect(verifierUnites([f('packages/sim/src/monde/x.ts', 'const a: number = 1;')])).toEqual([]);
  });
});
