/* =====================================================================
   Génération du profil altimétrique (docs/v0.0.3-parcours.md §3-4, docs/v0.0.4-parcours.md).
   Le profil est construit par ÉLÉMENTS (montées et descentes), pas par bruit :
     1. paramètres tirés : densité de D+, finale ; le nombre d'éléments est DÉDUIT du D+ visé (donc de la distance) ;
     2. placement des éléments selon la finale et les règles du type ;
     3. forme de chaque montée (pente moyenne, rampes, replats) et de la descente associée ;
     4. relief de fond entre les éléments (bruit lisse), mis à l'échelle pour atteindre le D+ visé ;
     5. pentes bornées, raccords arrondis.
   ===================================================================== */
import type { Element, Finale, TypeEtape } from './types';
import { PAS } from './types';
import type { Rng } from './rng';
import { borne, entier, logUniforme, melanger, range, tirer } from './rng';
import { denivelePositif } from './evaluer';

/** Fourchettes par type : ordres de grandeur à calibrer (docs/v0.0.3-parcours.md §3). */
export interface Fourchette {
  dens: [number, number];            // m de D+ par km
  fractionStructure: number;         // part du D+ portée par les montées structurantes
  montee: { L: [number, number]; g: [number, number]; capLongueur: number };   // longueur (m), pente moyenne (%), plafond en part de la distance
  penteMontee: number;               // % : plafond d'une rampe
  penteDescente: number;             // % : plafond d'une descente
  fond: { pente: number; ondes: [number, number] };   // pente max du relief de fond (%, sous le seuil de détection d'une montée), longueurs d'onde (m)
  penteMax: number;                  // % : plafond absolu de la pente lissée
}
export const FOURCHETTES: Record<TypeEtape, Fourchette> = {
  plate: { dens: [3, 8], fractionStructure: 0, montee: { L: [800, 2500], g: [2, 3.8], capLongueur: 0.1 }, penteMontee: 4, penteDescente: 4, fond: { pente: 1.6, ondes: [4000, 30_000] }, penteMax: 4 },
  vallonnee: { dens: [10, 18], fractionStructure: 0.7, montee: { L: [1000, 5000], g: [4, 9], capLongueur: 0.3 }, penteMontee: 14, penteDescente: 12, fond: { pente: 2.4, ondes: [2000, 9000] }, penteMax: 14 },
  montagne: { dens: [20, 35], fractionStructure: 0.8, montee: { L: [5000, 20_000], g: [5, 9], capLongueur: 0.5 }, penteMontee: 14, penteDescente: 12, fond: { pente: 2.4, ondes: [3000, 12_000] }, penteMax: 14 },
};

/** Probabilité de chaque finale selon le type (tirée au hasard, affichée après génération). */
export const FINALES: Record<TypeEtape, [Finale, number][]> = {
  plate: [['plat', 0.8], ['bosse', 0.2]],
  vallonnee: [['plat', 0.25], ['bosse', 0.4], ['descente', 0.2], ['sommet', 0.15]],
  montagne: [['sommet', 0.4], ['descente', 0.3], ['plat', 0.15], ['bosse', 0.15]],
};
export const tirerFinale = (r: Rng, type: TypeEtape): Finale => tirer(r, FINALES[type]);

interface Spec { D: number; L: number; g: number; Ld: number; drop: number; sorte: 'col' | 'bosse' }

/** Une montée tirée dans les fourchettes du type : longueur log-uniforme, pente, dénivelé qui en découle ; la descente associée est plus courte et plus raide. */
function tirerMontee(r: Rng, F: Fourchette, distance: number, type: TypeEtape): Spec {
  const [Lmin, Lmax] = F.montee.L;
  const cap = Math.max(Lmin, F.montee.capLongueur * distance);
  const g = range(r, F.montee.g[0], F.montee.g[1]);
  const L = Math.min(logUniforme(r, Lmin, Math.min(Lmax, cap)), cap);
  const D = (L * g) / 100;
  return avecDescente(r, F, { D, L, g, Ld: 0, drop: 0, sorte: type === 'montagne' ? 'col' : 'bosse' });
}
function avecDescente(r: Rng, F: Fourchette, s: Spec): Spec {
  const drop = s.D * range(r, 0.65, 1.0);
  const Ld = Math.max(s.L * range(r, 0.45, 0.85), (drop / F.penteDescente) * 100 * 1.15);
  return { ...s, drop, Ld };
}
/** Une petite bosse (finale « bosse » ou bosses isolées d'une étape plate). */
function tirerBosse(r: Rng, F: Fourchette, type: TypeEtape): Spec {
  if (type === 'plate') {
    const D = range(r, 25, 60), L = Math.max(range(r, 900, 2200), (D / 3.8) * 100);
    return avecDescente(r, F, { D, L, g: (D / L) * 100, Ld: 0, drop: 0, sorte: 'bosse' });
  }
  const D = range(r, 40, 140), g = range(r, 5, 8.5), L = (D / g) * 100;
  return avecDescente(r, F, { D, L, g, Ld: 0, drop: 0, sorte: 'bosse' });
}

/** Découpe une longueur en sections de pente (rampes et replats) dont le dénivelé total vaut `total`. */
function sections(r: Rng, nbPas: number, total: number, plafond: number, signe: 1 | -1, irregulier: boolean): number[] {
  const k = irregulier ? borne(Math.round(nbPas / 70) + entier(r, 0, 2), 1, 8) : 1;
  // longueurs aléatoires
  const cuts = [0, ...Array.from({ length: k - 1 }, () => r()).sort((a, b) => a - b), 1];
  const lens: number[] = []; for (let i = 0; i < k; i++) lens.push(Math.max(1, Math.round((cuts[i + 1]! - cuts[i]!) * nbPas)));
  const somme = lens.reduce((s, v) => s + v, 0);
  const mult = lens.map(() => range(r, 0.75, 1.25));
  if (irregulier && k >= 4) mult[entier(r, 1, k - 2)] = range(r, 0.45, 0.65);        // un replat (une montée moins raide, pas une descente)
  if (irregulier && k >= 3 && signe > 0) mult[entier(r, 0, k - 1)] = range(r, 1.4, 1.75);   // une rampe
  // normalisation : somme(g_j × len_j) = total, avec plafond (le surplus est redistribué)
  const moyenne = (total * 100) / (PAS * somme);        // pente moyenne (%) qui donne `total` mètres sur `nbPas` pas
  let g = mult.map((m) => m * moyenne);
  for (let it = 0; it < 4; it++) {
    const sur = g.reduce((s, v, j) => s + Math.max(0, v - plafond) * lens[j]!, 0);
    if (sur < 1e-9) break;
    const libre = g.reduce((s, v, j) => s + (v < plafond ? lens[j]! : 0), 0);
    g = g.map((v) => (v >= plafond ? plafond : libre > 0 ? v + sur / libre : v));
  }
  const out: number[] = [];
  for (let j = 0; j < k; j++) for (let i = 0; i < lens[j]!; i++) out.push(signe * Math.min(plafond, g[j]!));
  return out.slice(0, nbPas).concat(Array(Math.max(0, nbPas - out.length)).fill(signe * Math.min(plafond, moyenne)));
}

/** Relief de fond : somme de sinusoïdes de longueurs d'onde différentes, amplitude normalisée à 1 (pente en %). */
function fond(r: Rng, n: number, ondes: [number, number]): Float64Array {
  const f = new Float64Array(n);
  const K = 4;
  let rms = 0;
  const comp = Array.from({ length: K }, (_, k) => ({ lambda: logUniforme(r, ondes[0], ondes[1]), phase: range(r, 0, 2 * Math.PI), amp: 1 / (1 + k * 0.6) }));
  for (let i = 0; i < n; i++) { let s = 0; for (const c of comp) s += c.amp * Math.sin((2 * Math.PI * i * PAS) / c.lambda + c.phase); f[i] = s; rms += s * s; }
  const norm = Math.sqrt(rms / n) || 1;
  for (let i = 0; i < n; i++) f[i] /= norm;
  return f;
}

const moyenneMobile = (a: Float64Array, k: number): Float64Array => {
  const n = a.length, out = new Float64Array(n);
  let s = 0, c = 0;
  const pref = new Float64Array(n + 1); for (let i = 0; i < n; i++) pref[i + 1] = pref[i]! + a[i]!;
  for (let i = 0; i < n; i++) { const lo = Math.max(0, i - k), hi = Math.min(n - 1, i + k); s = pref[hi + 1]! - pref[lo]!; c = hi - lo + 1; out[i] = s / c; }
  return out;
};

export interface ProfilGenere { alt: Float64Array; elements: Element[]; cibleDplus: number }

/** Génère le profil d'une étape. `distance` en mètres. */
export function genererProfil(r: Rng, distance: number, type: TypeEtape, finale: Finale): ProfilGenere {
  const F = FOURCHETTES[type];
  const n = Math.round(distance / PAS) + 1;
  const km = distance / 1000;
  // 1. D+ visé : une densité dans la fourchette (on reste un peu à l'intérieur pour laisser de la marge), multipliée par la distance
  const dens = range(r, F.dens[0] + 0.12 * (F.dens[1] - F.dens[0]), F.dens[1] - 0.12 * (F.dens[1] - F.dens[0]));
  const cible = dens * km;
  const dStruct = F.fractionStructure * cible;

  // 2. éléments : leur nombre est déduit du D+ à porter
  let specs: Spec[] = [];
  if (type === 'plate') {
    const nb = Math.min(2, Math.round((km / 100) * range(r, 0, 2) + (r() < 0.25 ? 1 : 0)));
    for (let i = 0; i < nb; i++) specs.push(tirerBosse(r, F, type));
  } else {
    let somme = 0;
    while (somme < dStruct * 0.97 && specs.length < 16) {
      let s = tirerMontee(r, F, distance, type);
      const reste = dStruct - somme;
      if (s.D > reste * 1.2 && reste > 0) {                                    // la dernière se cale sur ce qui reste, dans les bornes du type
        const L = Math.max(F.montee.L[0] * 0.6, Math.min(s.L, (reste * 100) / s.g));
        s = avecDescente(r, F, { ...s, L, D: (L * s.g) / 100 });
        if (s.D < 30) break;
      }
      specs.push(s); somme += s.D;
    }
    if (specs.length === 0) specs.push(tirerMontee(r, F, distance, type));
  }

  // la montée de la finale (si la finale en demande une) : la plus grosse en montagne, une petite bosse sinon
  const iDecisif = specs.reduce((best, s, i) => (s.D > specs[best]!.D ? i : best), 0);
  const fixes: { spec: Spec; sommet: number; descente: boolean }[] = [];
  const libres: Spec[] = [];
  const decisif = specs[iDecisif];
  const reste = specs.filter((_, i) => i !== iDecisif);
  const marge = 600;
  if (finale === 'sommet' && type !== 'plate') {
    const s = type === 'montagne' ? decisif! : specs.slice().sort((a, b) => a.D - b.D)[Math.floor(specs.length / 2)]!;
    fixes.push({ spec: { ...s, Ld: 0, drop: 0 }, sommet: distance, descente: false });
    libres.push(...specs.filter((x) => x !== s));
  } else if (finale === 'descente' && type !== 'plate') {
    const s = decisif!;
    fixes.push({ spec: s, sommet: distance - s.Ld, descente: true });
    libres.push(...reste);
  } else if (finale === 'bosse') {
    const b = tirerBosse(r, F, type);
    const apres = Math.min(distance * 0.5, range(r, 500, 3500));
    fixes.push({ spec: b, sommet: distance - apres, descente: true });
    if (type === 'montagne' && decisif) {            // le col décisif est dans le dernier tiers, avant la bosse
      const d = decisif;
      const place = range(r, Math.min(12_000, distance / 5), Math.min(35_000, distance / 3));
      fixes.push({ spec: d, sommet: Math.min(distance - apres - b.L - 2000, distance - place), descente: true });
      libres.push(...reste);
    } else libres.push(...specs);
  } else {                                           // finale « plat » (ou plate sans bosse finale)
    if (type === 'montagne' && decisif) {
      const place = range(r, Math.min(25_000, distance / 4), Math.min(40_000, distance / 3));
      fixes.push({ spec: decisif, sommet: distance - place, descente: true });
      libres.push(...reste);
    } else libres.push(...specs);
  }
  // les éléments libres sont rangés avant le premier élément fixe, avec de la place entre eux ; ceux qui ne tiennent pas sont abandonnés (les plus petits d'abord)
  fixes.sort((a, b) => a.sommet - b.sommet);
  const finPlat = type === 'plate' ? 0 : finale === 'plat' ? (type === 'montagne' ? 0 : 8000) : 0;
  const debutFixes = fixes.length ? Math.min(...fixes.map((f) => f.sommet - f.spec.L)) : distance - finPlat;
  const dispo = Math.max(0, debutFixes - marge - (finPlat && !fixes.length ? finPlat : 0));
  const empreinte = (s: Spec) => s.L + s.Ld;
  let aPlacer = libres.slice().sort((a, b) => b.D - a.D);
  while (aPlacer.length && aPlacer.reduce((s, x) => s + empreinte(x), 0) > 0.92 * dispo) aPlacer.pop();
  aPlacer = melanger(r, aPlacer);
  const elements: Element[] = [];
  const posees: { spec: Spec; debut: number; sommet: number; fin: number }[] = [];
  {
    const place = aPlacer.reduce((s, x) => s + empreinte(x), 0);
    const jeu = Math.max(0, dispo - place);
    const poids = Array.from({ length: aPlacer.length + 1 }, () => r() + 0.05);
    const somme = poids.reduce((s, v) => s + v, 0);
    let curseur = marge;
    aPlacer.forEach((sp, i) => {
      curseur += (jeu * poids[i]!) / somme;
      posees.push({ spec: sp, debut: curseur, sommet: curseur + sp.L, fin: curseur + sp.L + sp.Ld });
      curseur += empreinte(sp);
    });
  }
  for (const f of fixes) {
    const sommet = f.sommet, debut = sommet - f.spec.L;
    posees.push({ spec: f.spec, debut: Math.max(0, debut), sommet, fin: f.descente ? Math.min(distance, sommet + f.spec.Ld) : sommet });
  }
  posees.sort((a, b) => a.debut - b.debut);
  // pas de chevauchement : on décale vers l'arrière si besoin, on abandonne ce qui sort de l'étape
  const sansChevauchement: typeof posees = [];
  for (const p of posees) {
    const prec = sansChevauchement[sansChevauchement.length - 1];
    if (prec && p.debut < prec.fin) {
      const dec = prec.fin - p.debut + 200;
      p.debut += dec; p.sommet += dec; p.fin = Math.min(distance, p.fin + dec);
    }
    if (p.sommet <= distance && p.debut >= 0) sansChevauchement.push(p);
  }

  // 3. pentes : on pose les montées et les descentes, le reste est du relief de fond
  const pente = new Float64Array(n - 1);     // pente de chaque pas (%)
  const masque = new Uint8Array(n - 1);      // 1 : sous la coupe d'un élément (pas de fond amplifié)
  for (const p of sansChevauchement) {
    const i0 = Math.round(p.debut / PAS), i1 = Math.min(n - 1, Math.round(p.sommet / PAS)), i2 = Math.min(n - 1, Math.round(p.fin / PAS));
    const nm = i1 - i0, nd = i2 - i1;
    if (nm < 2) continue;
    const D = p.spec.D;
    const mont = sections(r, nm, D, F.penteMontee, 1, p.spec.sorte === 'col' || p.spec.L > 1500);
    for (let i = 0; i < nm; i++) { pente[i0 + i] = mont[i]!; masque[i0 + i] = 1; }
    if (nd > 1) {
      const drop = Math.min(p.spec.drop, (nd * PAS * F.penteDescente) / 100);
      const desc = sections(r, nd, drop, F.penteDescente, -1, nd > 40);
      for (let i = 0; i < nd; i++) { pente[i1 + i] = desc[i]!; masque[i1 + i] = 1; }
    }
    elements.push({ sorte: p.spec.sorte, debut: p.debut, sommet: p.sommet, fin: p.fin, denivele: D, pente: (D / (p.sommet - p.debut)) * 100 });
  }

  // 4. relief de fond, mis à l'échelle pour atteindre le D+ visé
  const bruit = fond(r, n - 1, F.fond.ondes);
  const construire = (k: number): Float64Array => {
    const s = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) s[i] = masque[i] ? pente[i]! + 0.12 * Math.min(k, 2.5) * bruit[i]! : borne(k * bruit[i]!, -F.fond.pente, F.fond.pente);   // le fond n'amplifie pas les montées
    const lisse1 = moyenneMobile(moyenneMobile(s, 2), 2);                      // raccords arrondis
    for (let i = 0; i < n - 1; i++) lisse1[i] = borne(lisse1[i]!, -F.penteMax, F.penteMax);
    const alt = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) alt[i + 1] = alt[i]! + (lisse1[i]! * PAS) / 100;
    return alt;
  };
  let lo = 0, hi = 8, alt = construire(0);
  if (denivelePositif(alt) < cible) {
    for (let it = 0; it < 14; it++) {
      const k = (lo + hi) / 2; alt = construire(k);
      if (denivelePositif(alt) < cible) lo = k; else hi = k;
    }
    alt = construire((lo + hi) / 2);
  }
  // altitude de départ : on translate pour rester au-dessus de zéro
  let min = Infinity; for (let i = 0; i < n; i++) if (alt[i]! < min) min = alt[i]!;
  const offset = range(r, 30, type === 'montagne' ? 700 : 350) - min;
  for (let i = 0; i < n; i++) alt[i] += offset;
  return { alt, elements, cibleDplus: cible };
}
