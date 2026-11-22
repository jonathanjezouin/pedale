/* =====================================================================
   Évaluer une étape ou un morceau d'étape (docs/v0.0.3-parcours.md §6).
   Fonction PURE : elle ne lit que des altitudes échantillonnées. Le même code sert à contrôler le générateur,
   décrire l'étape dans le menu, évaluer « le reste de la course » pour un coureur, et plus tard analyser un parcours importé.
   ===================================================================== */
import type { Categorie, Evaluation, Montee, ProfilAlt, TypeEtape } from './types';
import { borne, lisse } from './rng';

/** Réglages de la lecture (ordres de grandeur, à valider par l'atelier et la validation par lot). */
export const LECTURE = {
  penteMontee: 3,              // % : au-dessus, on est dans une montée
  replatMax: 1000,             // m : un replat plus court ne coupe pas une montée
  perteReplatMax: 15,          // m : ni une petite descente qui perd moins que ça
  deniveleMin: 25,             // m : en dessous, ce n'est pas une montée
  longueurMin: 400,            // m
  seuilsCategorie: [['HC', 8000], ['1', 4500], ['2', 2200], ['3', 900], ['4', 350]] as [Categorie, number][],
  zoneArrivee: 10_000,         // m : un sommet à moins de cela de l'arrivée pèse 1
  decroissance: 30_000,        // m : au-delà, le poids décroît en exp(−(d − zone) / decroissance)
  hysteresisDplus: 3,          // m : ignorer les ondulations de moins que ça dans le D+
  puissance: 300,              // W : puissance de référence de l'estimation de durée
};

/** D+ au sens d'un compteur à hystérésis : on ne compte une montée que si elle dépasse 3 m. */
export function denivelePositif(alt: ArrayLike<number>, i0 = 0, i1 = alt.length - 1, seuil = LECTURE.hysteresisDplus): number {
  let bas = alt[i0]!, haut = alt[i0]!, monte = false, dplus = 0;
  for (let i = i0 + 1; i <= i1; i++) {
    const v = alt[i]!;
    if (!monte) { if (v < bas) bas = v; else if (v - bas >= seuil) { monte = true; haut = v; } }
    else if (v > haut) haut = v;
    else if (haut - v >= seuil) { dplus += haut - bas; monte = false; bas = v; }
  }
  if (monte) dplus += haut - bas;
  return dplus;
}

function categorieDe(score: number): Categorie {
  for (const [c, s] of LECTURE.seuilsCategorie) if (score >= s) return c;
  return 'bosse';
}

/** Altitude lissée sur ~100 m : les irrégularités de 20 m ne font pas une montée. */
function lisser(alt: ArrayLike<number>, k = 2): Float64Array {
  const n = alt.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { s += alt[j]!; c++; } out[i] = s / c; }
  return out;
}

/** Montées d'un morceau de profil [i0, i1] (indices d'échantillons) : fusion des portions à plus de 3 %, replats courts tolérés. */
function detecterMontees(alt: ArrayLike<number>, pas: number, i0: number, i1: number): { debut: number; fin: number }[] {
  const sm = lisser(alt);
  const runs: { debut: number; fin: number }[] = [];
  let debut = -1;
  for (let i = i0; i < i1; i++) {
    const pente = ((sm[i + 1]! - sm[i]!) / pas) * 100;
    if (pente > LECTURE.penteMontee) { if (debut < 0) debut = i; }
    else if (debut >= 0) { runs.push({ debut, fin: i }); debut = -1; }
  }
  if (debut >= 0) runs.push({ debut, fin: i1 });
  // fusion : un replat court (ou une petite descente) ne coupe pas la montée
  const fus: { debut: number; fin: number }[] = [];
  for (const r of runs) {
    const prec = fus[fus.length - 1];
    if (prec && (r.debut - prec.fin) * pas <= LECTURE.replatMax && sm[prec.fin]! - sm[r.debut]! <= LECTURE.perteReplatMax) prec.fin = r.fin;
    else fus.push({ ...r });
  }
  return fus;
}

/** Durée estimée à puissance constante : bilan de forces (traînée, roulement, pente), descente plafonnée à 72 km/h. */
function estimerDuree(alt: ArrayLike<number>, pas: number, i0: number, i1: number): number {
  const m = 83, g = 9.81, crr = 0.004, cda = 0.3, rho = 1.2;
  let t = 0;
  for (let i = i0; i < i1; i++) {
    const pente = (alt[i + 1]! - alt[i]!) / pas;
    let lo = 1.5, hi = 20;
    for (let k = 0; k < 18; k++) {
      const v = (lo + hi) / 2;
      const p = (0.5 * rho * cda * v * v + (crr + pente) * m * g) * v;
      if (p > LECTURE.puissance) hi = v; else lo = v;
    }
    t += pas / ((lo + hi) / 2);
  }
  return t;
}

const km1 = (m: number) => (m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',');

/**
 * Évalue le morceau [de, a] du profil, l'arrivée étant à `arrivee` (par défaut `a`). Distances en mètres depuis le départ.
 * Pour un coureur qui se demande « qu'est-ce qui m'attend ? » : de = sa position, a = arrivee = la ligne.
 */
export function evaluer(profil: ProfilAlt, de = 0, a?: number, arrivee?: number): Evaluation {
  const { alt, pas } = profil;
  const n = alt.length;
  const total = (n - 1) * pas;
  const fin = borne(a ?? total, 0, total);
  const debutM = borne(de, 0, fin);
  const arriveeM = arrivee ?? fin;
  const i0 = Math.round(debutM / pas), i1 = Math.max(i0, Math.round(fin / pas));
  const distance = (i1 - i0) * pas;

  // --- 1. montées
  const montees: Montee[] = [];
  const bornes = detecterMontees(alt, pas, i0, i1);
  for (let k = 0; k < bornes.length; k++) {
    const { debut: d, fin: f } = bornes[k]!;
    const denivele = alt[f]! - alt[d]!;
    const longueur = (f - d) * pas;
    if (denivele < LECTURE.deniveleMin || longueur < LECTURE.longueurMin) continue;
    const pente = (denivele / longueur) * 100;
    // pente max sur 500 m
    const fen = Math.min(25, f - d);
    let max500 = pente;
    for (let j = d; j + fen <= f; j++) max500 = Math.max(max500, ((alt[j + fen]! - alt[j]!) / (fen * pas)) * 100);
    const score = denivele * pente;
    const sommet = f * pas;
    const distanceArrivee = Math.max(0, arriveeM - sommet);
    // ce qui suit le sommet : jusqu'à la montée suivante (ou l'arrivée)
    const suivante = bornes.slice(k + 1).find((b) => (b.fin - b.debut) * pas >= LECTURE.longueurMin);
    const finApres = Math.min(suivante ? suivante.debut * pas : arriveeM, arriveeM);
    const longApres = Math.max(0, finApres - sommet);
    const iApres = Math.min(n - 1, Math.round(finApres / pas));
    const nature: Montee['apres']['nature'] = longApres < 300 ? 'arrivee' : alt[f]! - alt[iApres]! >= 0.02 * longApres ? 'descente' : 'plat';
    const arriveeAuSommet = sommet >= arriveeM - 300;
    const w = arriveeAuSommet || distanceArrivee <= LECTURE.zoneArrivee ? 1 : Math.exp(-(distanceArrivee - LECTURE.zoneArrivee) / LECTURE.decroissance);
    // ce qui suit atténue : après une longue descente ou un long plat, le groupe se reforme
    const att = arriveeAuSommet ? 1 : 1 - 0.5 * lisse(5000, 30_000, longApres);
    montees.push({
      debut: d * pas, fin: sommet, longueur, denivele, pente, penteMax500: max500, score, categorie: categorieDe(score),
      distanceArrivee, arriveeAuSommet, apres: { longueur: longApres, nature }, poids: w * att,
    });
  }

  // --- 2. finale : sprint / puncheur / grimpeur
  let gIdx = 0, pIdx = 0;
  for (const m of montees) {
    const boost = m.arriveeAuSommet ? 1.5 : 1;
    if (m.longueur >= 3000) gIdx += boost * m.poids * (m.score / 4000);
    else if (m.pente >= 4.5) pIdx += boost * m.poids * Math.exp(-Math.max(0, m.distanceArrivee - 5000) / 15_000) * (m.denivele / 80);
  }
  const brut = { sprint: 1, puncheur: 2 * pIdx, grimpeur: 2.5 * gIdx };
  const somme = brut.sprint + brut.puncheur + brut.grimpeur;
  // l'arrivée est-elle dans une côte ? (sommet à l'arrivée, ou montée sur le dernier kilomètre)
  const iA = Math.min(n - 1, Math.round(arriveeM / pas)), iAm = Math.max(0, iA - Math.round(1000 / pas));
  const arriveeEnCote = montees.some((m) => m.arriveeAuSommet) || (iA > iAm && ((alt[iA]! - alt[iAm]!) / ((iA - iAm) * pas)) * 100 > LECTURE.penteMontee);

  // --- 3. usure et lecture du type
  const denivele = denivelePositif(alt, i0, i1);
  const densite = distance > 0 ? denivele / (distance / 1000) : 0;
  const dMontees = montees.reduce((s, m) => s + m.denivele, 0);
  const denivelePondere = montees.reduce((s, m) => s + m.denivele * (0.7 + 0.06 * m.pente), 0) + 0.5 * Math.max(0, denivele - dMontees);
  const aUnCol = montees.some((m) => m.longueur >= 4000 && m.pente >= 4.5);
  const typeLu: TypeEtape = densite >= 19 && aUnCol ? 'montagne' : densite >= 9 ? 'vallonnee' : 'plate';

  const ev: Evaluation = {
    de: debutM, a: fin, arrivee: arriveeM, distance, denivele, densite, denivelePondere,
    duree: estimerDuree(alt, pas, i0, i1), montees,
    finale: { sprint: brut.sprint / somme, puncheur: brut.puncheur / somme, grimpeur: brut.grimpeur / somme, arriveeEnCote },
    typeLu, phrase: '',
  };
  ev.phrase = phraseDe(ev);
  return ev;
}

const NOM_CAT: Record<Categorie, string> = { HC: 'Col hors catégorie', '1': 'Col de 1re catégorie', '2': 'Col de 2e catégorie', '3': 'Côte de 3e catégorie', '4': 'Côte de 4e catégorie', bosse: 'Bosse' };

/** Une phrase lisible : ce qui compte pour la finale, ce qui suit, et ce que ça donne. */
function phraseDe(ev: Evaluation): string {
  const { sprint, puncheur, grimpeur } = ev.finale;
  const dom = ev.montees.filter((m) => m.categorie !== 'bosse' || m.pente >= 4.5).sort((a, b) => b.poids * b.score - a.poids * a.score)[0];
  const conclusion = grimpeur >= 0.5 ? 'finale pour grimpeurs' : puncheur >= 0.4 ? 'finale pour puncheurs' : sprint >= 0.6 ? 'finale pour sprinteurs' : 'finale ouverte';
  if (!dom || dom.poids < 0.05) {
    return ev.densite < 9 ? `Étape plate (${Math.round(ev.denivele)} m de D+), finale pour sprinteurs.` : `Étape sans difficulté décisive pour la finale (${Math.round(ev.denivele)} m de D+) : ${conclusion}.`;
  }
  const nom = NOM_CAT[dom.categorie];
  const detail = `${km1(dom.longueur)} km à ${dom.pente.toFixed(1).replace('.', ',')} %`;
  if (dom.arriveeAuSommet) return `${nom} (${detail}) avec arrivée au sommet : ${conclusion}.`;
  const apres = dom.apres.nature === 'descente' ? `puis ${km1(dom.apres.longueur)} km de descente` : `puis ${km1(dom.apres.longueur)} km de plat`;
  const reforme = dom.apres.longueur >= 15_000 && sprint >= 0.3 ? ' : le groupe peut se reformer' : '';
  return `${nom} (${detail}) à ${km1(dom.distanceArrivee)} km de l'arrivée, ${apres}${reforme} : ${conclusion}.`;
}
