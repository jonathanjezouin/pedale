/* =====================================================================
   Types du cœur de simulation — aucune dépendance (ni DOM, ni moteur).
   Les noms suivent le document de conception fonctionnelle v0.0.1.
   ===================================================================== */

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
  inGroup: boolean;
  wasInGroup: boolean;
  status: 'course' | 'arrive' | 'repris';
  finishTime: number | null;
  caughtAt: number | null;
  cuit: boolean;
  last: Decision | null;   // dernière décision (pour l'explication)
  draft: number;           // réduction de traînée actuelle 0..0.5
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
    rang: number;              // 0 = en tête de la file
    estEnTete: boolean; dansGroupe: boolean;
    ecartAuGroupe: number;     // m (si lâché)
    tempsEnTete: number;       // s en tête, en continu
    leadRecent: number; partRelais: number;
  };
  groupe: {
    vitesse: number; taille: number; soude: boolean; ecartMax: number;
    devantId: number | null; devantLetter: string | null;
    meneurId: number | null; meneurLetter: string | null; meneurDepuis: number;
    quelquunPasse: boolean;
    moyenneRelaisAutres: number;
    meilleurePointe: number; sprinteurDangereux: boolean; sprinteurLetter: string | null;
    attaque: { id: number; letter: string; avance: number; depuis: number; danger: number } | null;
    autres: AutreCoureur[];
  };
  course: { ecart: number; tendance: number; distRestante: number; distParcourue: number };
  role: { objectif: 'gagner' };
  profil: { endurance: number; pointe: number; generosite: number; agressivite: number; experience: number };
}

/** Valeurs exactes correspondantes : la trace montre ce que le coureur croyait *et* la réalité (§4.1). */
export interface Reel { reserve: number; explosivite: number; ecart: number; vitesseGroupe: number }

export interface Interprete {
  forme: 'frais' | 'bien' | 'limite' | 'cuit';
  explosivite: 'pleine' | 'entamee' | 'vide';
  ecart: 'fond' | 'stable' | 'grandit';
  pression: number;           // 0..1 : le peloton revient / est proche
  distance: 'sprint' | 'proche' | 'moyenne' | 'loin';
  groupe: 'soude' | 'etire' | 'rompu';
  placement: 'expose' | 'abrite';
  partRelais: 'moins' | 'egal' | 'plus';
  // quantités continues utilisées par « Vouloir »
  reserveBasse: number;       // 0..1
  explosiviteBasse: number;   // 0..1
  deficitRelais: number;      // 0..1 : j'ai moins roulé que les autres
  excesRelais: number;        // 0..1 : j'ai plus roulé que les autres
  rasLeBol: number;           // 0..1 : je suis presque seul à rouler
  sprintFocus: number;        // 0..1 : mon atout est le sprint
  phrases: string[];          // « je me sens frais », « l'écart fond »…
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
  ecartInit: number;     // s d'avance sur le peloton
  vent: number;          // m/s de vent de face
  vPeloton: number;      // m/s : vitesse de base du peloton poursuivant
  nbCoureurs: number;
  dt: number;
  trace: 'complet' | 'changements' | 'aucun';
}

export type EventType = 'attaque' | 'sprint' | 'tete' | 'lache' | 'rejoint' | 'repris' | 'arrivee' | 'ecart' | 'depart' | 'cuit';
export interface SimEvent { t: number; type: EventType; riderId: number | null; texte: string; grave: boolean }

export interface Peloton { x: number; v: number }

export interface Result {
  statut: 'en cours' | 'termine';
  echappeeSurvit: boolean;
  ordre: number[];            // arrivée, ids
  vainqueur: number | null;
  repris: number[];           // ids repris
  tFin: number;
  distanceReprise: number | null;
}

export interface World {
  t: number;
  cfg: Config;
  riders: Rider[];
  peloton: Peloton;
  finishX: number;
  events: SimEvent[];
  trace: Decision[];
  gapHistory: { t: number; gap: number }[];
  ecart: number;               // s
  tendance: number;            // s / 30 s
  meneurId: number | null;
  meneurDepuis: number;
  meneurCandidat: number | null;
  meneurCandidatDepuis: number;
  changementsDeTete: number;
  attaque: { id: number; t: number } | null;
  sprintLance: boolean;
  seuils: { ecart60: boolean; ecart40: boolean; ecart25: boolean };
  groupe: GroupSnap;
  result: Result;
  nextEventId: number;
  vRef: number;                // vitesse que l'échappée cherche à tenir (m/s)
}

export interface GroupSnap {
  ordre: Rider[];            // coureurs actifs, du plus avancé au dernier
  groupe: Rider[];           // chaîne principale
  vitesse: number;
  meneur: Rider | null;
  queue: Rider | null;
  xMoyen: number;
}
