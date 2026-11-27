import type { CoureurId, TraceDecision } from '../contrats/index.ts';

/**
 * Journal des traces : mémoire BORNÉE (les `capacite_n` décisions les plus récentes de chaque coureur).
 * Lu par le moteur, les tests, les statistiques et l'interface : une seule structure pour tous.
 */
export interface JournalTraces {
  readonly capacite_n: number;
  /** Ajoute une trace ; au-delà de la capacité, la plus ancienne du coureur est oubliée. */
  enregistrer(trace: TraceDecision): void;
  /** Nombre de traces actuellement gardées pour ce coureur (≤ capacite_n). */
  taille_n(coureurId: CoureurId): number;
  /** Trace gardée par rang : 0 = la plus ancienne encore gardée, taille_n - 1 = la plus récente. */
  lire(coureurId: CoureurId, rang_n: number): TraceDecision | undefined;
  derniere(coureurId: CoureurId): TraceDecision | undefined;
  /** Nombre total de traces enregistrées depuis le début, y compris celles déjà oubliées. */
  totalEnregistre_n(): number;
}

interface Tampon {
  readonly cases: (TraceDecision | undefined)[];
  debut_n: number;
  taille_n: number;
}

export function creerJournal(capacite_n: number): JournalTraces {
  if (!Number.isInteger(capacite_n) || capacite_n < 1) throw new Error('capacite_n doit être un entier >= 1');
  const tampons = new Map<CoureurId, Tampon>();
  let total_n = 0;

  const de = (id: CoureurId): Tampon => {
    let t = tampons.get(id);
    if (!t) {
      t = { cases: new Array<TraceDecision | undefined>(capacite_n).fill(undefined), debut_n: 0, taille_n: 0 };
      tampons.set(id, t);
    }
    return t;
  };

  return {
    capacite_n,
    enregistrer(trace) {
      const t = de(trace.coureurId);
      if (t.taille_n < capacite_n) {
        t.cases[(t.debut_n + t.taille_n) % capacite_n] = trace;
        t.taille_n++;
      } else {
        t.cases[t.debut_n] = trace; // on écrase la plus ancienne
        t.debut_n = (t.debut_n + 1) % capacite_n;
      }
      total_n++;
    },
    taille_n: (id) => tampons.get(id)?.taille_n ?? 0,
    lire(id, rang_n) {
      const t = tampons.get(id);
      if (!t || rang_n < 0 || rang_n >= t.taille_n) return undefined;
      return t.cases[(t.debut_n + rang_n) % capacite_n];
    },
    derniere(id) {
      const n = tampons.get(id)?.taille_n ?? 0;
      return n === 0 ? undefined : this.lire(id, n - 1);
    },
    totalEnregistre_n: () => total_n,
  };
}
