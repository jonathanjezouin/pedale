/* =====================================================================
   Types du cœur de simulation — aucune dépendance (ni DOM, ni moteur).
   Les noms suivent le document de conception fonctionnelle v0.0.1.
   ===================================================================== */

import type { Road } from './road';

export type Archetype = 'rouleur' | 'sprinteur' | 'attaquant' | 'opportuniste';

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  rouleur: 'rouleur généreux',
  sprinteur: 'sprinteur',
  attaquant: 'attaquant',
  opportuniste: 'opportuniste',
};

/** Les 7 intentions du POC (§6.2). */
export type Intention = 'relais' | 'abriter' | 'rabattre' | 'attaquer' | 'suivre' | 'gerer' | 'revenir';
export const INTENTIONS: Intention[] = ['abriter', 'relais', 'rabattre', 'attaquer', 'suivre', 'gerer', 'revenir'];
export const INTENTION_LABEL: Record<Intention, string> = {
  relais: 'Prendre un relais',
  abriter: "S'abriter",
  rabattre: 'Se rabattre',
  attaquer: 'Attaquer',
  suivre: "Suivre l'attaque",
  gerer: 'Gérer à son rythme',
  revenir: 'Revenir',
};

/** Profil individuel : l'individualité vient des paramètres, pas de logiques différentes (§4.2). */
export interface Profile {
  // physiologie
  cp: number;        // puissance critique (W) : ce qu'on peut tenir longtemps
  wPrime: number;    // capacité d'explosion (J) au-dessus de cp
  pPeak: number;     // puissance de pointe (W)
  tEnd: number;      // endurance : secondes « équivalent cp » avant épuisement de la réserve
  mass: number;      // coureur + vélo (kg)
  cda: number;       // surface frontale × traînée (m²)
  // tempérament
  generosite: number;   // 0..1
  agressivite: number;  // 0..1
  experience: number;   // 0..1 (réduit les défauts ; sert surtout au bruit, plus tard)
  // dérivé
  pointe: number;       // 0..1, pointe de vitesse normalisée
  lateral: number;      // habitude de placement : décalage latéral personnel dans la file (m)
  objectif: 'gagner';
}

/** Ce que veut le coureur et comment il le fait (état d'engagement). */
export interface IntentState {
  kind: Intention | null;
  since: number;          // instant du début de l'intention
  commitUntil: number;    // pas de réévaluation « douce » avant cet instant
  nextEval: number;       // réévaluation périodique
  phase: string;          // phase interne de l'« Agir » (passe, tete, decale, burst…)
  phaseSince: number;
  sprint: boolean;        // Attaquer en mode sprint final
  cible: number | null;   // coureur visé (Suivre l'attaque)
  vHold: number;          // vitesse tenue en relais
  side: -1 | 1;           // couloir latéral utilisé pour passer/attaquer
  forceEval: string | null;
}

export interface RiderStats {
  leadTime: number;       // secondes passées en tête
  leadRecent: number;     // temps de tête, décroissance exponentielle (τ = 300 s)
  relaisPris: number;     // nombre de prises de tête
  attaques: number;
  lastAttackT: number;    // dernier lancement d'attaque (−∞ si jamais)
  tempsParIntention: Record<Intention, number>;
  maxLeadStreak: number;
  leadStreak: number;
  leadStreakStart: number;
}

export interface Rider {
  id: number;
  letter: string;
  archetype: Archetype;
  profile: Profile;
  // état physique
  x: number; y: number; v: number; p: number;
  E: number;  // réserve d'endurance 0..1
  X: number;  // explosivité disponible 0..1
  // état de course
  intent: IntentState;
  stats: RiderStats;
  decroche: boolean;       // à plus de ~40 m du coureur juste devant (avec hystérésis)
  ecartDevant: number;     // m jusqu'au coureur juste devant (1e9 si je suis premier)
  status: 'course' | 'arrive';
  finishTime: number | null;
  cuit: boolean;
  last: Decision | null;   // dernière décision (pour l'explication)
  draft: number;           // réduction de traînée actuelle 0..0.5
  hw: number;              // vent de face ressenti (m/s, > 0 = de face) — calculé à chaque pas
  cw: number;              // vent de côté (m/s, > 0 = vient de la gauche, pousse vers la droite)
  posture: 0 | 1 | 2 | 3;  // 0 sur les cocottes, 1 en bas du cintre, 2 en danseuse, 3 écrasé de fatigue
  postureT: number;
  vy: number;              // vitesse latérale (m/s) : les changements de position sont lissés
  yTf: number;             // cible latérale filtrée
}

/* ------------------------- Perception / interprétation ------------------------- */

export interface AutreCoureur {
  id: number; letter: string; archetype: Archetype;
  leadRecent: number; tempsEnTete: number; pointe: number; x: number; v: number;
}

export interface Percu {
  moi: {
    reserve: number; explosivite: number; vitesse: number;
    abrite: number;            // réduction de traînée (0 = exposé)
    rang: number;              // position de course : 0 = premier
    estEnTete: boolean;        // personne ne m'abrite devant moi
    decroche: boolean;         // coureur juste devant à plus de ~40 m
    ecartDevant: number;       // m jusqu'au coureur juste devant (1e9 si premier)
    tempsEnTete: number;       // s en tête, en continu
    leadRecent: number; partRelais: number;
  };
  rivaux: {
    allure: number;            // vitesse médiane des coureurs encore en course (m/s)
    devantId: number | null; devantLetter: string | null;      // la roue qui m'abrite
    meneurId: number | null; meneurLetter: string | null; meneurDepuis: number;
    quelquunPasse: boolean;
    moyenneRelaisAutres: number;
    meilleurePointe: number; sprinteurDangereux: boolean; sprinteurLetter: string | null;
    attaque: { id: number; letter: string; avance: number; depuis: number; danger: number } | null;
    autres: AutreCoureur[];
  };
  course: { distRestante: number; distParcourue: number; ventFace: number; ventCote: number };
  role: { objectif: 'gagner' };
  profil: { endurance: number; pointe: number; generosite: number; agressivite: number; experience: number };
}

/** Valeurs exactes correspondantes : la trace montre ce que le coureur croyait *et* la réalité (§4.1). */
export interface Reel { reserve: number; explosivite: number; ecartDevant: number }

export interface Interprete {
  forme: 'frais' | 'bien' | 'limite' | 'cuit';
  explosivite: 'pleine' | 'entamee' | 'vide';
  distance: 'sprint' | 'proche' | 'moyenne' | 'loin';
  position: 'premier' | 'dans-la-course' | 'decroche';
  placement: 'expose' | 'abrite';
  partRelais: 'moins' | 'egal' | 'plus';
  // quantités continues utilisées par « Vouloir »
  reserveBasse: number;       // 0..1
  explosiviteBasse: number;   // 0..1
  deficitRelais: number;      // 0..1 : j'ai moins roulé que les autres
  excesRelais: number;        // 0..1 : j'ai plus roulé que les autres
  rasLeBol: number;           // 0..1 : je suis presque seul à rouler
  sprintFocus: number;        // 0..1 : mon atout est le sprint
  phrases: string[];          // « je me sens frais », « je suis décroché »…
}

/* ------------------------- Décision / trace ------------------------- */

export interface Raison { id: string; texte: string; valeur: number }
export interface Evaluation { intention: Intention; score: number; raisons: Raison[]; vetos: string[] }

export interface Decision {
  t: number;
  riderId: number; letter: string; archetype: Archetype;
  distRestante: number;
  declencheur: string;
  percu: Percu; reel: Reel; interprete: Interprete;
  evaluations: Evaluation[];
  precedente: Intention | null;
  intention: Intention;
  change: boolean;
  raisons: Raison[];
  action: string;
  engagementJusqua: number;
}

/* ------------------------- Monde ------------------------- */

export interface Config {
  seed: number;
  distance: number;      // m restants au départ de la simulation
  vent: number;          // m/s : vitesse du vent
  ventMode: 'fixe' | 'face';   // fixe : direction constante dans le monde ; face : toujours de face
  ventDecalage: number;  // rad : écart de la direction du vent au cap moyen de la route
  route: 'courbes' | 'droite';
  nbCoureurs: number;
  dt: number;
  trace: 'complet' | 'changements' | 'aucun';
}

export type EventType = 'attaque' | 'sprint' | 'tete' | 'decroche' | 'recolle' | 'arrivee' | 'depart' | 'cuit';
export interface SimEvent { t: number; type: EventType; riderId: number | null; texte: string; grave: boolean }

export interface Result {
  statut: 'en cours' | 'termine';
  ordre: number[];            // classement final, ids (les coureurs encore en route à la fin sont classés selon leur position)
  vainqueur: number | null;
  tFin: number;
}

export interface World {
  t: number;
  cfg: Config;
  riders: Rider[];
  finishX: number;
  events: SimEvent[];
  trace: Decision[];
  meneurId: number | null;
  meneurDepuis: number;
  meneurCandidat: number | null;
  meneurCandidatDepuis: number;
  changementsDeTete: number;
  attaque: { id: number; t: number } | null;
  sprintLance: boolean;
  vue: Vue;
  result: Result;
  nextEventId: number;
  vInit: number;               // allure de départ (m/s)
  road: Road;
  vent: { wx: number; wy: number };   // vecteur vitesse de l'air dans le monde (m/s)
}

/** Vue d'ensemble de la course à l'instant t (calculée une fois par pas) : aucun « groupe », juste le classement. */
export interface Vue {
  ordre: Rider[];            // coureurs encore en course, du plus avancé au dernier
  vitesse: number;           // vitesse médiane
  meneur: Rider | null;      // le plus avancé des coureurs dans la file
  xMoyen: number;
  xFront: number;            // abscisse du coureur le plus avancé
  tanB: number;              // tangente de l'angle du vent relatif : décalage latéral du sillage par mètre
  yTete: number;             // décalage latéral de la tête de file (côté du vent si vent de côté)
  coteMontant: -1 | 1;       // côté où l'on remonte la file (côté du vent)
}
