// Mise en forme pour l'affichage. C'est ici, et seulement ici, que les unités SI deviennent km/h, %, etc.
import type { Borne, Cadre, Commandes, Croyances, DonneeEtage, EcartPercuReel, Observation, Percu } from '@pedale/sim';

const nf = (x: number, decimales: number): string =>
  x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export const kmh = (m_s: number): string => `${nf(m_s * 3.6, 1)} km/h`;
export const pourcent = (ratio: number): string => `${nf(ratio * 100, 0)} %`;
export const watts = (w: number): string => `${nf(w, 0)} W`;
export const secondes = (s: number): string => `${nf(s, 2)} s`;

export function distance(m: number): string {
  return Math.abs(m) >= 1000 ? `${nf(m / 1000, 1)} km` : `${nf(m, 0)} m`;
}

export function duree(s: number): string {
  const total = Math.round(s);
  if (total >= 3600) {
    const minutes = Math.round(total / 60); // au-delà d'une heure, la minute suffit
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
  }
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`;
}

/** Valeur d'une comparaison perçu/réel, mise en forme selon son unité. */
export function valeurSelonUnite(x: number, unite: string): string {
  if (unite === 'm/s') return kmh(x);
  if (unite === 'ratio') return pourcent(x);
  return `${nf(x, 2)} ${unite}`;
}

export function ecartSelonUnite(e: EcartPercuReel): string {
  const d = e.percu - e.reel;
  if (Math.abs(d) < 1e-9) return 'aucun';
  return `${d > 0 ? '+' : '−'}${valeurSelonUnite(Math.abs(d), e.unite)}`;
}

const NOMS_GRANDEUR: Record<Borne['grandeur'], string> = {
  puissanceVisee_w: 'puissance',
  vitesseVisee_m_s: 'vitesse',
  positionLateraleVisee_m: 'position latérale',
  ecartRoueProche_m: 'écart à la roue',
  abriMinimal_ratio: 'abri minimal',
};

function valeurDeGrandeur(grandeur: Borne['grandeur'], x: number): string {
  if (grandeur === 'puissanceVisee_w') return watts(x);
  if (grandeur === 'vitesseVisee_m_s') return kmh(x);
  if (grandeur === 'abriMinimal_ratio') return pourcent(x);
  return distance(x);
}

/** « puissance entre 0 W et 288 W » */
export function texteCadre(cadre: Cadre): string {
  if (cadre.length === 0) return 'aucun cadre imposé';
  return cadre
    .map((b) => {
      const nom = NOMS_GRANDEUR[b.grandeur];
      const f = (x: number): string => valeurDeGrandeur(b.grandeur, x);
      if (b.min !== null && b.max !== null) return `${nom} entre ${f(b.min)} et ${f(b.max)}`;
      if (b.max !== null) return `${nom} ≤ ${f(b.max)}`;
      if (b.min !== null) return `${nom} ≥ ${f(b.min)}`;
      return `${nom} libre`;
    })
    .join(' ; ');
}

export const nomGrandeur = (g: Borne['grandeur']): string => NOMS_GRANDEUR[g];
export const valeurVisee = valeurDeGrandeur;

function scene(o: Observation | Percu): string[] {
  const c = o.corps;
  return [
    `vitesse ${kmh(c.vitesse_m_s)} · puissance ${watts(c.puissanceDelivree_w)}`,
    `réserve de fond ${pourcent(c.reserveLongue_ratio)} · réserve courte ${pourcent(c.reserveCourte_ratio)}`,
    `arrivée dans ${distance(o.distanceArrivee_m)} · ${o.routeDevant.length} points de route visibles · ${o.coureursVisibles.length} coureur(s) en vue`,
  ];
}

function croyances(c: Croyances): string[] {
  return [
    `je me crois à ${kmh(c.soi.vitesse_m_s)} avec ${pourcent(c.soi.reserveLongueEstimee_ratio)} de réserve`,
    `je pense tenir ${watts(c.soi.puissanceSoutenable_w)} longtemps`,
    `il me reste ${distance(c.resteAParcourir.distance_m)}, soit environ ${duree(c.resteAParcourir.tempsEstime_s)}`,
  ];
}

function commandes(c: Commandes): string[] {
  return [
    `puissance visée ${watts(c.puissanceVisee_w)} · position latérale ${distance(c.positionLateraleVisee_m)} · freinage ${pourcent(c.freinage_ratio)}`,
  ];
}

/** Quelques lignes lisibles pour ce qui entre ou sort d'un étage (les Volontés ont leur propre affichage). */
export function lignesDonnee(d: DonneeEtage): string[] {
  switch (d.etage) {
    case 'observation':
    case 'percu':
      return scene(d);
    case 'croyances':
      return croyances(d);
    case 'commandes':
      return commandes(d);
    case 'volontes':
      return [[d.objectif.but, d.intention.but, d.manoeuvre.but].map((b) => b.replaceAll('_', ' ')).join(' › ')];
  }
}

// — Vue « Étape » (UF 2.5) —

/** Pente signée, une décimale : « +5,2 % », « −8,0 % ». */
export function penteSignee(ratio: number): string {
  const v = Math.abs(ratio) * 100;
  const signe = Math.round(v * 10) === 0 ? '' : ratio > 0 ? '+' : '−';
  return `${signe}${nf(v, 1)} %`;
}

export const altitude = (m: number): string => `${nf(m, 0)} m`;
export const largeurRoute = (m: number): string => `${nf(m, 1)} m`;

/** Cap en degrés, 0° = est, positif vers la gauche (sens trigonométrique), ramené à [0, 360[. */
export function capDegres(rad: number): string {
  const d = ((((rad * 180) / Math.PI) % 360) + 360) % 360;
  return `${nf(d, 0)}°`;
}

/** Courbure lisible : « ligne droite » ou « virage à gauche, rayon 85 m ». */
export function courbureLisible(rayon_m: number | null, courbure_rad_m: number): string {
  if (rayon_m === null) return 'ligne droite';
  const cote = courbure_rad_m > 0 ? 'gauche' : 'droite';
  return `virage à ${cote}, rayon ${rayon_m >= 1000 ? nf(rayon_m / 1000, 1) + ' km' : nf(rayon_m, 0) + ' m'}`;
}

export const NOMS_TYPE_ETAPE: Record<string, string> = { plaine: 'Plaine', vallonne: 'Vallonné', montagne: 'Montagne' };
export const NOMS_TRONCON: Record<string, string> = { plat: 'plat', bosse: 'bosse', col: 'col', descente: 'descente' };
export const NOMS_CLASSE_PENTE: Record<string, string> = { faible: 'faible (< 3 %)', moyenne: 'moyenne (3 à 7 %)', forte: 'forte (> 7 %)' };

/** Distance du curseur : mètres sous le kilomètre, sinon kilomètres avec deux décimales. */
export function positionKm(m: number): string {
  return `${nf(m / 1000, 2)} km`;
}
