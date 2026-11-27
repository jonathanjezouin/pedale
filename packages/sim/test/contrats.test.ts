// Ce fichier est surtout vérifié par la COMPILATION (npm run typecheck) : les lignes
// `@ts-expect-error` doivent provoquer une erreur de type, sinon la compilation échoue.
import { describe, expect, it } from 'vitest';
import type {
  Agir, Commandes, Croyances, Interpreter, Observation, Percevoir, Percu, Vouloir, Volontes,
} from '../src/contrats/index.ts';

declare const observation: Observation;
declare const percu: Percu;
declare const croyances: Croyances;
declare const volontes: Volontes;
declare const commandes: Commandes;

declare const percevoir: Percevoir;
declare const interpreter: Interpreter;
declare const vouloir: Vouloir;
declare const agir: Agir;
declare const memoire: never;
declare const alea: { suivant(): number };

describe('contrats des étages', () => {
  it('chaque étage n’accepte que la sortie de l’étage précédent', () => {
    // Cas corrects (jamais exécutés : seule la compilation compte)
    const chaine = () => {
      const p = percevoir(observation, memoire, alea);
      const c = interpreter(p.sortie, memoire);
      const v = vouloir(c.sortie, memoire);
      return agir(v.sortie, memoire).sortie;
    };
    expect(typeof chaine).toBe('function');

    // Cas mal typés : chacun DOIT être refusé par le compilateur.
    const mauvais = () => {
      // @ts-expect-error interpréter ne reçoit pas l'Observation brute
      interpreter(observation, memoire);
      // @ts-expect-error vouloir ne reçoit pas le Perçu : il ne voit que les Croyances
      vouloir(percu, memoire);
      // @ts-expect-error vouloir ne reçoit pas l'Observation (la vérité du monde)
      vouloir(observation, memoire);
      // @ts-expect-error agir ne reçoit pas les Croyances
      agir(croyances, memoire);
      // @ts-expect-error percevoir ne reçoit pas des Commandes
      percevoir(commandes, memoire, alea);
      // @ts-expect-error l'Observation ne peut pas être passée pour un Perçu
      const faux: Percu = observation;
      return faux;
    };
    expect(typeof mauvais).toBe('function');
  });
});
