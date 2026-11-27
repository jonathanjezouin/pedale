import type {
  Agir, Alea, Commandes, Croyances, CoureurId, EcartPercuReel, EntreeTrace, Interpreter, MemoireCoureur, Observation,
  Percevoir, Percu, Pilote, SourceDecision, TraceDecision, Vouloir,
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
  /** Coureurs dont la décision est prise par une source externe (le reste est décidé par l'IA). */
  readonly pilotes?: ReadonlyMap<CoureurId, Pilote>;
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

interface Decision {
  readonly source: SourceDecision;
  readonly commandes: Commandes;
  readonly vouloir: EntreeTrace;
  readonly agir: EntreeTrace;
  readonly memoireVouloir: MemoireCoureur['vouloir'];
  readonly memoireAgir: MemoireCoureur['agir'];
}

const RAISON_PILOTE = { code: 'pilote_externe', explication: 'Cette décision vient d’une source externe (script ou joueur), pas de l’IA.' };

/**
 * Vouloir + Agir, ou la source externe qui les remplace. Le pilote ne reçoit que { percu, croyances } :
 * aucun accès au monde. S'il rend des Volontés, Agir les traduit ; s'il rend des Commandes, elles sont
 * appliquées telles quelles.
 */
function decider(
  dep: Dependances, id: CoureurId, croyances: Croyances, percu: Percu, m: MemoireCoureur,
): Decision {
  const pilote = dep.pilotes?.get(id);
  if (!pilote) {
    const v = dep.vouloir(croyances, m.vouloir);
    const a = dep.agir(v.sortie, m.agir);
    return {
      source: 'ia',
      commandes: a.sortie,
      vouloir: { etage: 'vouloir', recu: croyances, produit: v.sortie, resume: v.resume, raisons: v.raisons },
      agir: { etage: 'agir', recu: v.sortie, produit: a.sortie, resume: a.resume, raisons: a.raisons },
      memoireVouloir: v.memoire,
      memoireAgir: a.memoire,
    };
  }

  const reponse = pilote({ percu, croyances });
  if (reponse.etage === 'volontes') {
    const a = dep.agir(reponse, m.agir);
    return {
      source: 'pilote_volontes',
      commandes: a.sortie,
      vouloir: { etage: 'vouloir', recu: croyances, produit: reponse, resume: 'Volontés fournies par la source externe.', raisons: [RAISON_PILOTE] },
      agir: { etage: 'agir', recu: reponse, produit: a.sortie, resume: a.resume, raisons: a.raisons },
      memoireVouloir: m.vouloir,
      memoireAgir: a.memoire,
    };
  }
  if (reponse.etage === 'commandes') {
    return {
      source: 'pilote_commandes',
      commandes: reponse,
      vouloir: { etage: 'vouloir', recu: croyances, produit: reponse, resume: 'Vouloir contourné : la source externe fournit directement des commandes.', raisons: [RAISON_PILOTE] },
      agir: { etage: 'agir', recu: reponse, produit: reponse, resume: 'Commandes de la source externe appliquées telles quelles.', raisons: [RAISON_PILOTE] },
      memoireVouloir: m.vouloir,
      memoireAgir: m.agir,
    };
  }
  throw new Error(`Réponse de pilote invalide pour « ${id} » : attendu des Volontés ou des Commandes`);
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
    const decision = decider(dep, reel.id, i.sortie, p.sortie, m);

    commandes.set(reel.id, decision.commandes);
    memoires[reel.id] = {
      percevoir: p.memoire,
      interpreter: i.memoire,
      vouloir: decision.memoireVouloir,
      agir: decision.memoireAgir,
    };
    traces.push({
      coureurId: reel.id,
      source: decision.source,
      instant_s: partie.monde.instant_s,
      percevoir: { etage: 'percevoir', recu: observation, produit: p.sortie, resume: p.resume, raisons: p.raisons },
      interpreter: { etage: 'interpreter', recu: p.sortie, produit: i.sortie, resume: i.resume, raisons: i.raisons },
      vouloir: decision.vouloir,
      agir: decision.agir,
      ecartsPercuReel: ecartsPercuReel(reel, p.sortie),
    });
  }

  const monde = dep.physique(partie.monde, commandes, partie.pas_s);
  return { partie: { ...partie, monde, memoires }, traces };
}
