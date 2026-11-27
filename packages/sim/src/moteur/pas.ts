import type {
  Agir, Alea, Commandes, CoureurId, EcartPercuReel, Interpreter, MemoireCoureur, Observation,
  Percevoir, TraceDecision, Vouloir,
} from '../contrats/index.ts';
import type { CoureurReel, EtatMonde } from '../monde/index.ts';

/** Tout ce que le moteur appelle : injecté pour pouvoir substituer, espionner ou piloter chaque morceau. */
export interface Dependances {
  readonly observer: (monde: EtatMonde, id: CoureurId) => Observation;
  readonly percevoir: Percevoir;
  readonly interpreter: Interpreter;
  readonly vouloir: Vouloir;
  readonly agir: Agir;
  readonly physique: (monde: EtatMonde, commandes: ReadonlyMap<CoureurId, Commandes>, dt_s: number) => EtatMonde;
}

/** État complet d'une partie. `alea` est la seule partie mutable (générateur seedé). */
export interface Partie {
  readonly monde: EtatMonde;
  readonly memoires: Readonly<Record<CoureurId, MemoireCoureur>>;
  readonly alea: Alea;
  readonly pas_s: number;
}

export function memoireInitiale(): MemoireCoureur {
  return {
    percevoir: { dernierInstant_s: null },
    interpreter: { dernierInstant_s: null },
    vouloir: { courantes: null, evenementsPrecedents: [] },
    agir: { dernierInstant_s: null },
  };
}

function ecartsPercuReel(reel: CoureurReel, percu: { corps: { vitesse_m_s: number; reserveLongue_ratio: number } }): EcartPercuReel[] {
  return [
    { grandeur: 'vitesse', unite: 'm/s', percu: percu.corps.vitesse_m_s, reel: reel.vitesse_m_s },
    { grandeur: 'reserveLongue', unite: 'ratio', percu: percu.corps.reserveLongue_ratio, reel: reel.energieLongue_j / reel.energieLongueMax_j },
  ];
}

/**
 * Un pas du moteur : pour chaque coureur, observer puis percevoir > interpréter > vouloir > agir ;
 * ensuite, une seule fois, la physique applique toutes les commandes.
 */
export function pas(partie: Partie, dep: Dependances): { readonly partie: Partie; readonly traces: readonly TraceDecision[] } {
  const commandes = new Map<CoureurId, Commandes>();
  const memoires: Record<CoureurId, MemoireCoureur> = {};
  const traces: TraceDecision[] = [];

  for (const reel of partie.monde.coureurs) {
    const m = partie.memoires[reel.id] ?? memoireInitiale();

    const observation = dep.observer(partie.monde, reel.id);
    const p = dep.percevoir(observation, m.percevoir, partie.alea);
    const i = dep.interpreter(p.sortie, m.interpreter);
    const v = dep.vouloir(i.sortie, m.vouloir);
    const a = dep.agir(v.sortie, m.agir);

    commandes.set(reel.id, a.sortie);
    memoires[reel.id] = { percevoir: p.memoire, interpreter: i.memoire, vouloir: v.memoire, agir: a.memoire };
    traces.push({
      coureurId: reel.id,
      instant_s: partie.monde.instant_s,
      percevoir: { etage: 'percevoir', recu: observation, produit: p.sortie, resume: p.resume, raisons: p.raisons },
      interpreter: { etage: 'interpreter', recu: p.sortie, produit: i.sortie, resume: i.resume, raisons: i.raisons },
      vouloir: { etage: 'vouloir', recu: i.sortie, produit: v.sortie, resume: v.resume, raisons: v.raisons },
      agir: { etage: 'agir', recu: v.sortie, produit: a.sortie, resume: a.resume, raisons: a.raisons },
      ecartsPercuReel: ecartsPercuReel(reel, p.sortie),
    });
  }

  const monde = dep.physique(partie.monde, commandes, partie.pas_s);
  return { partie: { ...partie, monde, memoires }, traces };
}
