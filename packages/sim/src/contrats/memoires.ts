import type { Volontes } from './volontes.ts';

// Un bloc de mémoire par étage (décision Q5, architecture.md §8). Passé en entrée, rendu en sortie.
// Ces blocs grandiront avec les chantiers ; pour l'instant ils ne contiennent que le strict utile.

export interface MemoirePercevoir {
  readonly dernierInstant_s: number | null;
}

export interface MemoireInterpreter {
  readonly dernierInstant_s: number | null;
}

export interface MemoireVouloir {
  /** Dernières volontés retenues : base de la cadence de réévaluation de chaque niveau. */
  readonly courantes: Volontes | null;
}

export interface MemoireAgir {
  readonly dernierInstant_s: number | null;
}

/** Toute la mémoire d'un coureur. */
export interface MemoireCoureur {
  readonly percevoir: MemoirePercevoir;
  readonly interpreter: MemoireInterpreter;
  readonly vouloir: MemoireVouloir;
  readonly agir: MemoireAgir;
}
