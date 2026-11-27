/* =====================================================================
   Types du cœur de simulation — aucune dépendance (ni DOM, ni moteur).
   Les noms suivent le document de conception fonctionnelle v0.0.1.
   ===================================================================== */

import type { Road } from './road';
import type { Evaluation as EvaluationParcours, Montee, Parcours } from '@pedale/parcours';
export type { EvaluationParcours };

export type Archetype = 'rouleur' | 'sprinteur' | 'attaquant' | 'opportuniste' | 'grimpeur';

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  rouleur: 'rouleur',
  sprinteur: 'sprinteur',
  attaquant: 'attaquant',
  opportuniste: 'opportuniste',
  grimpeur: 'grimpeur',
};

/** Les 7 intentions finales (docs/v0.0.3-comportement.md §4.6). */
export type Intention = 'abriter' | 'placer' | 'participer' | 'attaquer' | 'suivre' | 'revenir' | 'gerer';
export const INTENTIONS: Intention[] = ['abriter', 'placer', 'participer', 'attaquer', 'suivre', 'revenir', 'gerer'];
export const INTENTION_LABEL: Record<Intention, string> = {
  abriter: "S'abriter",
  placer: 'Se placer',
  participer: 'Participer',
  attaquer: 'Attaquer',
  suivre: "Suivre l'attaque",
  revenir: 'Revenir',
  gerer: 'Gérer à son rythme',
};
/** Place visée dans le groupe (décision de Vouloir ; le déplacement est l'affaire d'Agir) :
 *  garder (où je suis ; en tête : mener), tete (passer devant), avant (remonter près de l'avant sans passer en tête),
 *  derriere (me placer juste derrière le coureur `cible` : le dernier qui roule, la queue, ou une place où ça coûte moins). */
export type Place = 'garder' | 'tete' | 'avant' | 'derriere';
export const PLACE_LABEL: Record<Place, string> = { garder: 'où je suis', tete: 'en tête', avant: "près de l'avant", derriere: 'derrière un coureur' };

/** Profil individuel : l'individualité vient des paramètres, pas de logiques différentes (§4.2). */
export interface Profile {
  // physiologie
  ftp: number;       // FTP (W) : ce qu'on peut tenir environ une heure. En dessous l'explosivité ne se consomme pas, au-dessus elle se vide
  wPrime: number;    // capacité d'explosion (J) au-dessus du FTP
  pPeak: number;     // puissance de pointe (W)
  tEnd: number;      // endurance : secondes à 100 % du FTP avant épuisement de la réserve
  mass: number;      // coureur + vélo (kg)
  cda: number;       // surface frontale × traînée (m²)
  // tempérament
  agressivite: number;  // 0..1
  experience: number;   // 0..1 (réduit le bruit sur soi et les défauts d'exécution)
  sens: number;         // 0..1 sens de la course : qualité de la lecture des autres (positions, vitesses, intentions)
  sangFroid: number;    // 0..1 : le bruit ne monte pas quand on est sous pression (fatigue, décroché, sprint)
  fatigueRelais: number;   // 0..1 : fatigue aiguë à laquelle j'estime avoir fait mon tour en tête (v0.1.2c) ; un rouleur d'endurance la place plus haut
  // dérivé
  pointe: number;       // 0..1, pointe de vitesse normalisée
  lateral: number;      // habitude de placement : décalage latéral personnel dans la file (m)
  objectif: 'gagner';
}

/** Ce que veut le coureur (contrat Vouloir → Agir, docs/v0.0.3-comportement.md §4.1).
 *  Contrat : { nature = kind, cible, effort, limites { effortMax, fatigueMax } }. Seul « Vouloir » écrit ici. */
export interface IntentState {
  kind: Intention | null;      // nature
  since: number;               // instant du début de l'intention
  commitUntil: number;         // pas de réévaluation « douce » avant cet instant
  nextEval: number;            // réévaluation périodique
  sprint: boolean;             // Attaquer en mode sprint final
  cible: number | null;        // coureur visé (Suivre l'attaque)
  /** Effort visé, en part du FTP (0,83 = 83 %). `null` : l'effort n'est pas choisi, il est la conséquence de la roue à tenir. */
  effort: number | null;
  /** Limites acceptées pour cette action, recalculées à chaque évaluation. */
  effortMax: number;           // part du FTP au plus (au-dessus de 1 on puise dans l'explosivité)
  fatigueMax: number;          // fatigue (1 − E) au-delà de laquelle je n'accepte plus de tenir ça
  place: Place;                // place visée dans mon groupe
  placeAtteinte: boolean;      // Vouloir a reçu « place-atteinte » / « passage-termine » pour cette place
  forceEval: string | null;    // déclencheur de réévaluation (événements du monde : décroché, attaque, sprint…)
}

/** Événements déclarés par « Agir » vers « Vouloir » (§4.2). Agir ne modifie jamais l'intention. */
export type EvenementAgir = 'place-atteinte' | 'fin-burst' | 'roue-perdue' | 'limite-atteinte' | 'passage-termine';
export interface EvenementDeclare { type: EvenementAgir; t: number; detail?: string }

/** État d'exécution propre à « Agir » (le « geste ») : invisible de « Vouloir ». */
export interface Geste {
  nature: Intention | null;    // intention pour laquelle ce geste a été initialisé
  phase: string;               // monte, decale, rejoint, garde, burst, sustain, couloir…
  phaseSince: number;
  vHold: number;               // vitesse tenue en tête
  side: -1 | 1;                // couloir latéral utilisé pour passer/attaquer
  limiteT: number;             // dernier « limite-atteinte » déclaré (anti-répétition)
  surLimiteDepuis: number;     // instant depuis lequel ce que demande la roue dépasse mon effort max (−1 : non)
  roueT: number;               // dernier « roue-perdue » déclaré
  enSuivi: boolean;            // roue à moins de 6 m au pas précédent
  place: Place | null;         // place visée pour laquelle la phase courante a été engagée
  roueId: number | null;       // roue actuellement suivie (pour réinitialiser filtre et recherche d'abri)
  vRoue: number;               // vitesse de la roue telle que je la perçois (filtrée par mon délai de réaction)
  branche: string;             // branche d'agir qui a produit la dernière commande (diagnostic)
  errGap: number;              // erreur lente d'appréciation de l'écart à la roue (m), bruit d'exécution (v0.1.2b)
  aRoue: number;               // accélération de la roue telle que je l'estime (dérivée filtrée de vRoue) : sert à anticiper (v0.1.1)
  dyAbri: number;              // décalage latéral trouvé par la recherche locale de l'abri (m)
  sensAbri: 1 | -1;            // sens de la recherche locale
  abriPrev: number;            // abri ressenti à la précédente comparaison
  abriT: number;               // instant de la dernière comparaison
  latErr: number;              // petite erreur de trajectoire latérale (précision d'exécution)
  porteDepuis: number;         // instant où j'ai commencé à ouvrir la porte à quelqu'un (−1 : non)
}

/** Compétence d'exécution (docs/v0.0.3-comportement.md §4.3), dérivée de l'expérience : un bon coureur est près et centré, réagit vite. */
export interface Execution {
  ecartConfort: number;        // m : écart visé derrière la roue
  precisionLat: number;        // m : amplitude de l'erreur de trajectoire
  delai: number;               // s : délai de réaction à la vitesse de la roue
  pasAbri: number;             // m : pas de la recherche locale de l'abri
}

/** Ce que je me rappelle d'un autre coureur, à force de le voir (aucune donnée exacte sur son profil). */
export interface Souvenir {
  vu: number;                  // secondes où je l'ai eu en vue
  tete: number;                // secondes où je l'ai vu en tête (décroissance exponentielle, τ = 300 s)
  v: number;                   // sa dernière vitesse observée (m/s)
  accel: number;               // son accélération observée (lissée)
  accelMax: number;            // la plus forte accélération que je lui ai vue (décroît lentement)
  derniereVue: number;         // instant de la dernière observation
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
  aigue: number;  // fatigue aiguë 0..1 : monte au-dessus du plancher, redescend en dessous (docs/v0.0.7-fatigue.md §1)
  X: number;  // explosivité disponible 0..1
  usure: { echelle: number; legere: boolean };   // régime d'usure de la réserve : fin d'étape du POC ou étape (docs/v0.0.5-pente.md §6)
  tSprint: number;  // secondes cumulées à un effort neuromusculaire (au-dessus de 1,25 × FTP) : la puissance maximale retombe avec elles
  // état de course
  intent: IntentState;
  geste: Geste;
  exec: Execution;
  rng: () => number;                // bruit de perception propre au coureur (déterministe)
  biais: { reserve: number; explosivite: number };   // biais durable de la fatigue ressentie
  memoire: Record<number, Souvenir>;
  vus: VuAutre[];                   // ce que je vois des autres à la dernière observation (bruité)
  attaqueVue: { id: number; t: number; vu: number } | null;   // attaque que je crois voir
  allure: { v: number; hist: number[]; tendance: number };    // allure du groupe telle que je la perçois
  enTetePrev: boolean;
  suiviDePres: boolean;             // quelqu'un est collé à ma roue (à moins de 4 m derrière, dans la file)
  stats: RiderStats;
  evenements: EvenementDeclare[];   // déclarés par Agir depuis la dernière décision
  decroche: boolean;       // à plus de ~40 m du coureur juste devant (avec hystérésis)
  ecartDevant: number;     // m jusqu'au coureur juste devant (1e9 si je suis premier)
  status: 'course' | 'arrive';
  finishTime: number | null;
  cuit: boolean;
  last: Decision | null;   // dernière décision (pour l'explication)
  draft: number;           // réduction de traînée actuelle 0..0.5
  pente: number;           // pente sous le coureur (fraction, > 0 en montée) — lue sur la route à chaque pas
  hw: number;              // vent de face ressenti (m/s, > 0 = de face) — calculé à chaque pas
  cw: number;              // vent de côté (m/s, > 0 = vient de la gauche, pousse vers la droite)
  posture: 0 | 1 | 2 | 3;  // 0 sur les cocottes, 1 en bas du cintre, 2 en danseuse, 3 écrasé de fatigue
  postureT: number;
  vy: number;              // vitesse latérale (m/s) : les changements de position sont lissés
  yTf: number;             // cible latérale filtrée
}

/* ------------------------- Perception / interprétation ------------------------- */

/** Un autre coureur tel que je le vois : positions et vitesses bruitées, posture visible. Jamais son profil ni sa réserve. */
export interface VuAutre {
  id: number; letter: string;
  dx: number;            // m, > 0 : devant moi
  dy: number;            // décalage latéral relatif (m)
  vRel: number;          // vitesse relative (m/s, > 0 : il va plus vite que moi)
  posture: 0 | 1 | 2 | 3;
  enLigne: boolean;      // dans la file (et non en train de passer ou de se laisser glisser)
  accel: number;         // son accélération, déduite de mes observations successives
}

export interface Percu {
  moi: {
    reserve: number; explosivite: number; vitesse: number;   // ressenties : approximatives (bruit + biais)
    aigue: number;   // fatigue aiguë ressentie
    abrite: number;            // abri ressenti (0 = exposé), bruité
    rang: number;              // position de course : 0 = premier
    estEnTete: boolean;        // personne ne m'abrite devant moi
    decroche: boolean;         // coureur juste devant à plus de ~40 m
    ecartDevant: number;       // m jusqu'au coureur juste devant (1e9 si premier)
    tempsEnTete: number;       // s en tête, en continu
    leadRecent: number;        // mon propre temps passé en tête (mémoire personnelle)
    effortRessenti: number;    // puissance actuelle en part du FTP (palier ressenti)
    groupeTaille: number;      // coureurs dans mon groupe (moi compris)
    groupeEtendue: number;     // m entre le premier et le dernier de mon groupe que je vois
    rangDansGroupe: number;    // 0 = premier de mon groupe
    evenements: EvenementAgir[];   // ce qu'Agir m'a déclaré depuis ma dernière décision
  };
  rivaux: {
    allure: number;            // vitesse du groupe que je perçois (m/s)
    tendanceAllure: number;    // variation de cette allure sur ~10 s (m/s)
    devantId: number | null; devantLetter: string | null;      // la roue qui m'abrite
    vus: VuAutre[];
    attaque: { id: number; letter: string; avance: number; depuis: number; vRel: number } | null;
  };
  course: {
    distRestante: number; distParcourue: number; ventFace: number; ventCote: number;
    pente: number;              // % ressenti sous moi (> 0 en montée)
    penteDevant: number;        // % moyen des 400 m devant : je vois la route
    profil: EvaluationParcours | null;  // ce qu'il reste de l'étape lu sur le profil (rafraîchi par km) ; null hors étape
  };
  role: { objectif: 'gagner' };
  profil: { endurance: number; pointe: number; agressivite: number; experience: number; fatigueRelais: number };   // ce que je sais de moi
}

/** Valeurs exactes correspondantes : la trace montre ce que le coureur croyait *et* la réalité (§4.1). */
export interface Reel { reserve: number; explosivite: number; ecartDevant: number }

/** Un autre coureur tel que je l'ai interprété : déduit de son comportement seul. */
export interface AutreInterprete {
  id: number; letter: string; dx: number;
  disposition: 'rouleur' | 'suiveur' | 'inconnu';   // qui a roulé devant, d'après ce que j'ai vu
  danger: number;                                   // 0..1 : danger supposé (accélère-t-il fort ?)
  etat: 'frais' | 'marque' | 'about';               // état apparent (posture)
}

export interface Interprete {
  forme: 'frais' | 'bien' | 'limite' | 'cuit';
  explosivite: 'pleine' | 'entamee' | 'vide';
  distance: 'sprint' | 'proche' | 'moyenne' | 'loin';
  position: 'premier' | 'dans-la-course' | 'decroche';
  placement: 'expose' | 'abrite';
  // quantités continues utilisées par « Vouloir »
  reserveBasse: number;       // 0..1
  explosiviteBasse: number;   // 0..1
  abriPerdu: number;          // 0..1 : quelqu'un est devant (à portée), mais je n'ai plus son abri (v0.1.2b)
  retourFaisable: number;     // 0..1 : revenir sur lui, à vitesse de rapprochement raisonnable, tient dans ce que je peux soutenir
  aigue: number;              // 0..1 : jambes qui chargent (au-dessus du plancher depuis un moment)
  sprintFocus: number;        // 0..1 : mon atout est le sprint
  autres: AutreInterprete[];
  groupe: { taille: number; rythme: 'stable' | 'monte' | 'baisse'; cohesion: 'serre' | 'etire' };
  plancher: number;           // mon plancher du moment (part du FTP) : haut de Z3, qui baisse avec la fatigue
  effortRequis: number;       // l'effort que me coûterait de tenir l'allure du groupe en tête (exposé), en part du FTP
  inconfort: boolean;         // je suis à la peine : mon effort dépasse mon plancher alors que je ne mène pas
  inconfortEnTete: boolean;   // en tête, tenir l'allure du groupe me coûterait plus que mon plancher
  terrain: 'plat' | 'montee' | 'descente';
  colEnCours: Montee | null;  // la montée qui compte pour la finale dans laquelle je suis
  colDevant: { distance: number; montee: Montee } | null;   // la prochaine montée qui compte, devant moi
  budget: number;             // réserve que je pense avoir en arrivant (E − coût estimé du reste de l'étape) ; 1 hors étape
  dangerMax: number;          // 0..1 : le plus dangereux des autres, supposé
  dangerLetter: string | null;
  fractionFrais: number;      // 0..1 : part des autres qui ont l'air frais
  avanceSurVus: number;       // m : écart avec le plus proche coureur que je vois derrière (25 si aucun)
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
  /** Une étape générée (docs/v0.0.5-pente.md) : la route porte son relief, le départ est un départ d'étape. Sans elle : fin d'étape du POC (plate, 16-24 km). */
  parcours?: Parcours;
  /** Composition du lot de coureurs (un archétype par coureur) ; par défaut, deux de chaque archétype du POC, ou la composition d'étape. */
  composition?: Archetype[];
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
  neutralisee: boolean;       // garde-fou technique : la course a dépassé la durée maximale (personne n'avance) et a été arrêtée
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
  tMax: number;                // durée maximale de la course (s) : garde-fou technique
  evalCache: Record<number, EvaluationParcours>;   // lecture du reste de l'étape depuis chaque km (profil connu des coureurs)
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
  xTeteGroupe: Record<number, number>;   // abscisse de la tête du groupe de chaque coureur (ancrage de sa file, v0.1.2b)
  tanB: number;              // tangente de l'angle du vent relatif : décalage latéral du sillage par mètre
  groupes: Rider[][];        // vue dérivée : suites de coureurs consécutifs sans « décroché » ; chaque groupe de la tête vers l'arrière
  yTete: number;             // décalage latéral de la tête de file (côté du vent si vent de côté)
  coteMontant: -1 | 1;       // côté où l'on remonte la file (côté du vent)
}
