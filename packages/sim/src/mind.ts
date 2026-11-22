/* =====================================================================
   Le raisonnement d'un coureur, par étages lisibles et traçables (§4) :
     Percevoir → Interpréter → Vouloir  (Agir est dans action.ts, l'observation continue dans observation.ts)
   Le bruit vit dans Percevoir et Interpréter, jamais dans Vouloir (§4.1).
   Un coureur ne connaît ni le profil ni la réserve des autres : il les déduit de ce qu'il a vu (docs/v0.0.3-comportement.md §4.7).
   ===================================================================== */
import type {
  AutreInterprete, Evaluation, EvenementAgir, Interprete, Intention, Percu, Place, Raison, Reel, Rider, World,
} from './types';
import { INTENTIONS, ARCHETYPE_LABEL } from './types';
import { capf, E_CUIT, resistance, vitesseSolo, wattsPour, X_MIN } from './physics';
import { clamp, smoothstep } from './util';
import { abrite, enLigne } from './placement';
import { evaluer as evaluerParcours } from '@pedale/parcours';
import type { Evaluation as EvaluationParcours } from '@pedale/parcours';
import { aptitudes } from './calibration';
import { EFFORT_PHYSIQUE, PLANCHER } from './paliers';
import { bruitDe, dangerSuppose, dispositionDe, gauss } from './observation';

/** Tous les « boutons » de réglage des raisons au même endroit (équilibrage par le batch). */
export const TUNE = {
  hysteresis: 0.6,            // un coureur ne change d'avis que si l'écart de score dépasse ça
  intervalleBase: 7,          // s entre deux réévaluations (réduit par l'expérience)
  dureeTour: 45,              // s en tête au bout desquelles l'envie de quitter la tête devient forte
  seuilQuitter: 3.5,          // somme des raisons de quitter la tête au-delà de laquelle je m'écarte
  envieRouler: 2.5,           // poids de « le groupe va moins vite que ce que je peux tenir »
};

/** Distance à laquelle le coureur lance son sprint : ce que son explosivité restante lui permet de tenir,
 *  un peu plus tôt s'il est agressif, un peu plus tard s'il a une grosse pointe. */
export function distanceSprint(r: Rider): number {
  const p = r.profile;
  // durée que l'explosivité permet, bornée par la décroissance neuromusculaire (au-delà de ~18 s, la puissance retombe trop pour qu'un sprint tienne)
  const dureeTenable = Math.min(18, (r.X * p.wPrime) / (0.75 * Math.max(100, p.pPeak - p.ftp)));   // s
  const f = 1.05 - 0.15 * p.pointe + 0.15 * p.agressivite;
  // quelqu'un collé à ma roue me passera si je pars à bout de souffle : je garde une marge
  const marge = r.suiviDePres ? 0.75 : 1;
  return Math.round(clamp(f * dureeTenable * 12.5 * marge, 110, 480));
}

/** Durée d'engagement minimale de chaque intention (§6.2). */
export function engagement(_r: Rider, k: Intention): number {
  switch (k) {
    case 'abriter': return 6;
    case 'placer': return 14;
    case 'participer': return 12;
    case 'attaquer': return 10;
    case 'suivre': return 10;
    case 'revenir': return 10;
    case 'gerer': return 15;
  }
}

/* ---------------------------- Contrat Vouloir → Agir ---------------------------- */

/** Fatigue (1 − E) que j'accepte pour une action : plus il reste de route, plus elle est basse ; près de l'arrivée, elle tend vers « tout donner ».
 *  Première version simple (docs/v0.0.3-comportement.md §4.1), à ajuster à l'œil. */
export function fatigueAcceptee(distRestante: number): number {
  return 0.55 + 0.40 * (1 - smoothstep(2000, 12000, distRestante));
}

export interface Contrat {
  effort: number | null; effortMax: number; fatigueMax: number;
  place: Place; cible: number | null;
  raisonsPlace: Raison[];     // pourquoi je quitte la tête, pourquoi je passe devant…
}
interface CtxContrat {
  change: boolean; sprint: boolean;
  evts: EvenementAgir[];
  prev: { effort: number | null; place: Place; placeAtteinte: boolean; cible: number | null };
}

/** Effort que je choisis quand je mène : mon plancher, sauf raison. En dessous si j'économise (réserve basse, atout sprint) ;
 *  au-dessus si je veux user un rival que je crois dangereux. */
export function effortParticiper(p: Percu, ip: Interprete, prof: { pointe: number }): number {
  const d = p.course.distRestante;
  const user = clamp((ip.dangerMax - prof.pointe) / 0.3, 0, 1) * smoothstep(1500, 6000, d);
  return clamp(ip.plancher + 0.08 * user - 0.04 * ip.sprintFocus * smoothstep(1500, 6000, d), 0.55, 1.0);
}

/** Vitesse que je tiendrais seul à cet effort (ce que je « voudrais » rouler). */
export const vitesseVoulue = (r: Rider, effort: number) => vitesseSolo(wattsPour(r, effort), r.profile.cda, r.profile.mass, r.hw, r.pente);

/** Effort visé et limites de l'intention choisie, place visée, roue visée. Valeurs de départ = celles du POC, à affiner à l'œil. */
export function contrat(r: Rider, p: Percu, ip: Interprete, k: Intention, ctx: CtxContrat): Contrat {
  const d = p.course.distRestante, fat = fatigueAcceptee(d), prof = r.profile;
  const raisonsPlace: Raison[] = [];
  let effort: number | null = null, effortMax = 1, fatigueMax = fat;
  let place: Place = 'garder';
  const roue = p.rivaux.devantId;
  let cible: number | null = roue;
  const evtFait = ctx.evts.includes('place-atteinte') || ctx.evts.includes('passage-termine');
  const persiste = !ctx.change && ctx.prev.place !== 'garder' && !ctx.prev.placeAtteinte && !evtFait;
  // ceux que je vois derrière moi, le plus en arrière d'abord
  const derriere = ip.autres.filter((a) => a.dx < 0).sort((a, b) => a.dx - b.dx);
  const cibleVisible = ctx.prev.cible !== null && p.rivaux.vus.some((v) => v.id === ctx.prev.cible);
  const persisteDerriere = persiste && ctx.prev.place === 'derriere' && cibleVisible;

  switch (k) {
    case 'abriter':
      effortMax = 1.2;                                              // jusqu'à Z5 pour reprendre l'abri
      if (persisteDerriere) { place = 'derriere'; cible = ctx.prev.cible; }
      else if (p.moi.estEnTete) {
        // en tête, on ne s'abrite qu'en se laissant glisser derrière les autres : derrière le dernier que je vois
        const dernier = derriere[0];
        if (dernier) { place = 'derriere'; cible = dernier.id; }
      } else if (ip.inconfort && p.moi.rangDansGroupe < 2 && p.moi.groupeTaille >= 3) {
        // à la peine : je cherche la place où ça coûte moins (un cran plus loin dans la file, où deux sillages me couvrent)
        const juste = derriere[derriere.length - 1];
        if (juste) {
          place = 'derriere'; cible = juste.id;
          raisonsPlace.push({ id: 'inconfort', texte: `Je suis à ${Math.round(p.moi.effortRessenti * 100)} % du FTP, au-dessus de mon plancher : je cherche une place où ça coûte moins`, valeur: clamp((p.moi.effortRessenti - PLANCHER) * 10, 0.1, 3) });
        }
      }
      break;
    case 'placer':
      effortMax = 1.2; fatigueMax = Math.max(fat, 0.7);
      place = 'avant';
      break;
    case 'participer': {
      effortMax = 1.15;                                             // un dépassement est une courte pointe (Z5), au-dessus de l'effort de mené
      const user = clamp((ip.dangerMax - prof.pointe) / 0.3, 0, 1) * smoothstep(1500, 6000, d);
      effort = effortParticiper(p, ip, prof);
      if (persisteDerriere) { place = 'derriere'; cible = ctx.prev.cible; break; }
      if (persiste && ctx.prev.place === 'tete') { place = 'tete'; break; }
      if (p.moi.estEnTete) {
        // quitter la tête : décision de celui qui est devant, avec ses raisons
        const rq: Raison[] = [];
        const q = (id: string, texte: string, valeur: number) => { if (Math.abs(valeur) >= 0.05) rq.push({ id, texte, valeur }); };
        // un « tour » ne compte que si je roule vraiment : à l'arrêt ou au ralenti, rester devant ne m'use pas
        q('duree', "J'ai fait mon tour en tête", 4 * clamp(p.moi.tempsEnTete / TUNE.dureeTour, 0, 1.2) * smoothstep(0.6, 0.85, p.moi.effortRessenti));
        q('rasLeBol', 'Je suis presque le seul à rouler depuis longtemps', 4.5 * ip.rasLeBol);
        q('reserve', 'Ma réserve est basse', 3 * ip.reserveBasse);
        q('user', `Je veux continuer à user ${ip.dangerLetter ?? 'mon rival'}`, -2 * user);
        // je me replace derrière le dernier qui roule (« inconnu » compte comme relayeur tant qu'il n'a pas montré le contraire) ; s'il n'y en a pas, je reste devant
        const relayeur = derriere.find((a) => a.disposition !== 'suiveur');
        if (relayeur && rq.reduce((s, x) => s + x.valeur, 0) >= TUNE.seuilQuitter) { place = 'derriere'; cible = relayeur.id; raisonsPlace.push(...rq); }
      } else if (!p.moi.decroche) {
        // passer devant un groupe qui va moins vite que ce que je veux tenir
        const vVoulue = vitesseVoulue(r, effort);
        const ecart = vVoulue - p.rivaux.allure;
        // je n'engage pas le dépassement si je vois quelqu'un manœuvrer devant moi (il passe, ou il se laisse glisser)
        const manoeuvre = p.rivaux.vus.some((q) => !q.enLigne && q.dx > -3 && q.dx < 25);
        if (ecart > 0.5 && p.rivaux.tendanceAllure <= 0.2 && !manoeuvre) {
          place = 'tete';
          raisonsPlace.push({ id: 'rythme', texte: `Le groupe va à ${(p.rivaux.allure * 3.6).toFixed(0)} km/h, je veux rouler à ${(vVoulue * 3.6).toFixed(0)} km/h`, valeur: clamp(ecart, 0, 3) });
        }
      }
      break;
    }
    case 'attaquer': {
      cible = null;
      const burstFini = !ctx.change && !ctx.sprint && (ctx.evts.includes('fin-burst') || (ctx.prev.effort !== null && ctx.prev.effort < EFFORT_PHYSIQUE));
      if (ctx.sprint) { effort = EFFORT_PHYSIQUE; effortMax = EFFORT_PHYSIQUE; fatigueMax = 1.0; }          // tout ce que la physique permet
      else if (burstFini) { effort = 1.07; effortMax = 1.07; fatigueMax = Math.max(fat, 0.8); }
      else { effort = EFFORT_PHYSIQUE; effortMax = EFFORT_PHYSIQUE; fatigueMax = Math.max(fat, 0.8); }
      break;
    }
    case 'suivre':
      cible = p.rivaux.attaque ? p.rivaux.attaque.id : null;
      effortMax = EFFORT_PHYSIQUE; fatigueMax = Math.max(fat, 0.8);
      break;
    case 'revenir':
      cible = null; effortMax = 1.12; fatigueMax = Math.max(fat, 0.85);
      break;
    case 'gerer':
      cible = null; effort = 0.78; effortMax = 0.78; fatigueMax = 1.0;
      break;
  }
  return { effort, effortMax, fatigueMax, place, cible, raisonsPlace };
}

/* ---------------------------- Le profil de l'étape, connu des coureurs ---------------------------- */

/** Lecture du reste de l'étape depuis la position x (au km inférieur), mise en cache : les coureurs connaissent le road-book
 *  (docs/v0.0.5-pente.md §2). Hors étape (fin de course du POC) : null. */
export function profilRestant(w: World, x: number): EvaluationParcours | null {
  const p = w.road.profilEtape;
  if (!p) return null;
  const k = Math.min(Math.floor(Math.max(0, x) / 1000), Math.max(0, Math.floor(w.finishX / 1000) - 1));
  return (w.evalCache[k] ??= evaluerParcours(p, k * 1000, w.finishX));
}

/** Charge moyenne de l'usure (effort moyen au cube, abrité, avec l'effet « sous le plancher ») pour estimer le coût du reste de l'étape.
 *  Heuristique calibrée sur des étapes simulées (docs/v0.0.5-pente.md §7). */
const CHARGE_BUDGET = 0.6;

/* ---------------------------- Percevoir ---------------------------- */

export function percevoir(w: World, r: Rider): { percu: Percu; reel: Reel } {
  const g = w.vue;
  const sig = bruitDe(r);
  const rang = g.ordre.indexOf(r);
  const devant = voisinDevant(w, r);
  const estEnTete = enLigne(w, r) && !g.ordre.some((o) => o !== r && abrite(w, o, r, 1.0, 1e9));
  const tempsEnTete = w.meneurId === r.id ? w.t - w.meneurDepuis : 0;
  const groupe = g.groupes.find((gr) => gr.includes(r)) ?? [r];
  const idsG = new Set(groupe.map((o) => o.id));
  // étendue du groupe : d'après ce que je vois (moi + ceux de mon groupe en vue)
  const dxG = [0, ...r.vus.filter((q) => idsG.has(q.id)).map((q) => q.dx)];
  const etendue = Math.max(...dxG) - Math.min(...dxG);
  let attaque: Percu['rivaux']['attaque'] = null;
  if (r.attaqueVue) {
    const q = r.vus.find((v) => v.id === r.attaqueVue!.id);
    if (q) attaque = { id: q.id, letter: q.letter, avance: Math.max(0, q.dx), depuis: w.t - r.attaqueVue.t, vRel: q.vRel };
  }
  const percu: Percu = {
    moi: {
      reserve: clamp(r.E + r.biais.reserve + gauss(r.rng) * 0.01 * sig, 0, 1),
      explosivite: clamp(r.X + r.biais.explosivite + gauss(r.rng) * 0.015 * sig, 0, 1),
      vitesse: r.v,
      abrite: Math.max(0, r.draft + gauss(r.rng) * 0.015 * sig),
      rang, estEnTete, decroche: r.decroche, ecartDevant: r.ecartDevant,
      tempsEnTete, leadRecent: r.stats.leadRecent,
      effortRessenti: r.p / r.profile.ftp, groupeTaille: groupe.length, groupeEtendue: etendue, rangDansGroupe: groupe.indexOf(r),
      evenements: r.evenements.map((e) => e.type),
    },
    rivaux: {
      allure: r.allure.hist.length ? r.allure.v : g.vitesse,
      tendanceAllure: r.allure.tendance,
      devantId: devant ? devant.id : null, devantLetter: devant ? devant.letter : null,
      vus: r.vus,
      attaque,
    },
    course: {
      distRestante: Math.max(0, w.finishX - r.x - 0.9), distParcourue: r.x, ventFace: r.hw, ventCote: r.cw,
      pente: r.pente * 100, penteDevant: ((w.road.alt(r.x + 400) - w.road.alt(r.x)) / 400) * 100, profil: profilRestant(w, r.x),
    },
    role: { objectif: 'gagner' },
    profil: { endurance: r.profile.tEnd, pointe: r.profile.pointe, agressivite: r.profile.agressivite, experience: r.profile.experience },
  };
  const reel: Reel = { reserve: r.E, explosivite: r.X, ecartDevant: r.ecartDevant };
  return { percu, reel };
}

/** Coureur directement devant dans mon couloir (roue à suivre), à 35 m max. */
export function voisinDevant(w: World, r: Rider, tolLat = 1.0, portee = 35): Rider | null {
  let best: Rider | null = null;
  for (const o of w.vue.ordre) {
    if (o === r || !abrite(w, o, r, tolLat, portee)) continue;
    if (!best || o.x < best.x) best = o;
  }
  return best;
}

/* ---------------------------- Interpréter ---------------------------- */

export function interpreter(r: Rider, p: Percu): Interprete {
  const E = p.moi.reserve, X = p.moi.explosivite;
  const forme: Interprete['forme'] = E > 0.6 ? 'frais' : E > 0.35 ? 'bien' : E > E_CUIT ? 'limite' : 'cuit';
  const explosivite: Interprete['explosivite'] = X > 0.7 ? 'pleine' : X > X_MIN ? 'entamee' : 'vide';
  const d = p.course.distRestante;
  const distance: Interprete['distance'] = d < 600 ? 'sprint' : d < 2500 ? 'proche' : d < 8000 ? 'moyenne' : 'loin';
  const position: Interprete['position'] = p.moi.decroche ? 'decroche' : p.moi.rang === 0 ? 'premier' : 'dans-la-course';

  // les autres, d'après ce que j'ai vu : disposition, danger supposé, état apparent
  const autres: AutreInterprete[] = p.rivaux.vus.map((q) => {
    const s = r.memoire[q.id];
    return {
      id: q.id, letter: q.letter, dx: q.dx,
      disposition: dispositionDe(s), danger: dangerSuppose(s),
      etat: q.posture === 3 ? 'about' : q.posture === 2 ? 'marque' : 'frais',
    };
  });
  let dangerMax = 0, dangerLetter: string | null = null;
  for (const a of autres) if (a.danger > dangerMax) { dangerMax = a.danger; dangerLetter = a.letter; }
  const fractionFrais = autres.length ? autres.filter((a) => a.etat === 'frais').length / autres.length : 1;
  const derriere = p.rivaux.vus.filter((q) => q.dx < 0).map((q) => -q.dx);
  const avanceSurVus = derriere.length ? Math.min(...derriere) : 25;

  // qui a roulé : ce que je me souviens avoir vu des autres, comparé à mon propre temps de tête
  const mine = p.moi.leadRecent;
  const tetes = Object.values(r.memoire).filter((s) => s.vu >= 10).map((s) => s.tete);
  const moy = tetes.length ? tetes.reduce((s, v) => s + v, 0) / tetes.length : mine;
  const excesRelais = clamp((mine - moy) / Math.max(25, mine), 0, 1);
  const sumAll = mine + tetes.reduce((s, v) => s + v, 0);
  const rasLeBol = sumAll >= 90 ? clamp((mine / sumAll - 0.45) / 0.4, 0, 1) : 0;
  const sprintFocus = clamp((p.profil.pointe - 0.45) / 0.4, 0, 1);
  // mon plancher du moment, et ce que me coûterait de tenir l'allure du groupe en tête (exposé) : la question « puis-je rouler sans me cramer ? »
  const plancher = PLANCHER * capf(p.moi.reserve);
  const vAllure = Math.max(p.rivaux.allure, 1);
  const effortRequis = (resistance(vAllure, 0, r) * vAllure) / r.profile.ftp;

  // le terrain et ce que le profil du reste de l'étape annonce (étape seulement : hors étape rien ne change)
  const pente = p.course.pente;
  const terrain: Interprete['terrain'] = pente > 2.5 ? 'montee' : pente < -2.5 ? 'descente' : 'plat';
  const ev = p.course.profil, xPos = p.course.distParcourue;
  let colEnCours: Interprete['colEnCours'] = null, colDevant: Interprete['colDevant'] = null, budget = 1;
  if (ev) {
    for (const m of ev.montees) {
      if (m.poids < 0.1 || (m.categorie === 'bosse' && m.pente < 4.5)) continue;
      if (m.debut <= xPos && xPos <= m.fin) colEnCours = m;
      else if (m.debut > xPos && (!colDevant || m.debut - xPos < colDevant.distance)) colDevant = { distance: m.debut - xPos, montee: m };
    }
    // ce que le reste de l'étape va me coûter, d'après sa durée et mon régime d'usure ; ce qu'il me restera en arrivant
    budget = p.moi.reserve - (ev.duree * CHARGE_BUDGET) / (r.profile.tEnd * r.usure.echelle);
  }

  const tend = p.rivaux.tendanceAllure;
  const rythme: Interprete['groupe']['rythme'] = tend > 0.4 ? 'monte' : tend < -0.4 ? 'baisse' : 'stable';
  const cohesion: Interprete['groupe']['cohesion'] = p.moi.groupeTaille > 1 && p.moi.groupeEtendue / (p.moi.groupeTaille - 1) > 8 ? 'etire' : 'serre';

  const phrases: string[] = [];
  phrases.push(forme === 'frais' ? 'je me sens frais' : forme === 'bien' ? 'je me sens bien' : forme === 'limite' ? 'je suis à la limite' : 'je suis cuit');
  if (explosivite === 'vide') phrases.push("je n'ai plus d'explosivité");
  if (excesRelais > 0.25) phrases.push("j'ai plus roulé que ce que j'ai vu des autres");
  if (p.moi.groupeTaille > 1) phrases.push(`je suis dans un groupe de ${p.moi.groupeTaille}${rythme === 'baisse' ? ', l\'allure baisse' : rythme === 'monte' ? ', l\'allure monte' : ''}`);
  if (!p.moi.estEnTete && p.moi.effortRessenti > plancher + 0.03) phrases.push(`je suis à la peine (${Math.round(p.moi.effortRessenti * 100)} % du FTP, au-dessus de mon plancher de ${Math.round(plancher * 100)} %)`);
  if (p.moi.estEnTete) phrases.push(effortRequis <= plancher + 0.05 ? `tenir cette allure en tête me coûte ${Math.round(effortRequis * 100)} % du FTP : dans mon plancher` : `tenir cette allure en tête me coûterait ${Math.round(effortRequis * 100)} % du FTP, au-dessus de mon plancher de ${Math.round(plancher * 100)} %`);
  if (terrain !== 'plat') phrases.push(terrain === 'montee' ? `je suis en montée (${pente.toFixed(1).replace('.', ',')} %)` : `je suis en descente (${pente.toFixed(1).replace('.', ',')} %)`);
  if (colDevant) phrases.push(`une montée qui compte arrive dans ${(colDevant.distance / 1000).toFixed(1).replace('.', ',')} km (${(colDevant.montee.longueur / 1000).toFixed(0)} km à ${colDevant.montee.pente.toFixed(1).replace('.', ',')} %)`);
  if (budget < 0.2) phrases.push(`ma réserve ne suffira pas pour le reste de l'étape`);
  if (position === 'decroche') phrases.push(`je suis décroché (${Math.round(p.moi.ecartDevant)} m)`);
  else if (position === 'premier') phrases.push('je suis en tête de la course');
  else if (p.moi.estEnTete) phrases.push('je suis en tête de mon groupe');
  const roulent = autres.filter((a) => a.disposition === 'rouleur').map((a) => a.letter);
  const suiveurs = autres.filter((a) => a.disposition === 'suiveur').map((a) => a.letter);
  if (roulent.length) phrases.push(`${roulent.join(', ')} roule${roulent.length > 1 ? 'nt' : ''} souvent devant`);
  if (suiveurs.length) phrases.push(`${suiveurs.join(', ')} reste${suiveurs.length > 1 ? 'nt' : ''} à l'abri`);
  if (dangerLetter && dangerMax > 0.4) phrases.push(`${dangerLetter} accélère fort : dangereux`);
  return {
    forme, explosivite, distance, position, placement: p.moi.abrite > 0.12 ? 'abrite' : 'expose',
    reserveBasse: clamp((0.45 - E) / 0.35, 0, 1), explosiviteBasse: clamp((0.6 - X) / 0.4, 0, 1),
    excesRelais, rasLeBol, sprintFocus, autres, groupe: { taille: p.moi.groupeTaille, rythme, cohesion },
    terrain, colEnCours, colDevant, budget, plancher, effortRequis, inconfort: !p.moi.estEnTete && p.moi.effortRessenti > plancher + 0.03,
    inconfortEnTete: p.moi.estEnTete && effortRequis > plancher + 0.05,
    dangerMax, dangerLetter, fractionFrais, avanceSurVus, phrases,
  };
}

/* ---------------------------- Vouloir ---------------------------- */

const mk = (liste: Raison[], id: string, texte: string, valeur: number) => { if (Math.abs(valeur) >= 0.05) liste.push({ id, texte, valeur }); };

/** Évalue chaque intention : veto d'abord (impossibilités), puis une liste de raisons nommées. */
export function evaluer(w: World, r: Rider, p: Percu, it: Interprete): Evaluation[] {
  const out: Evaluation[] = [];
  const d = p.course.distRestante;
  const prof = r.profile;
  const cuit = p.moi.reserve < E_CUIT;
  const sansExplosif = p.moi.explosivite < X_MIN;
  const enTete = p.moi.estEnTete;
  // terrain : la côte qui compte et ma réserve pour le reste de l'étape (sans effet hors étape)
  const budgetBas = clamp((0.2 - it.budget) / 0.3, 0, 1);
  const poidsCol = it.colEnCours?.poids ?? 0;
  const aptMontagne = aptitudes(prof).montagne / 5.86;
  for (const k of INTENTIONS) {
    const raisons: Raison[] = [];
    const vetos: string[] = [];

    switch (k) {
      case 'abriter': {
        if (p.moi.decroche) vetos.push('Je suis décroché : pas de roue à suivre, je dois revenir ou gérer');
        // garder des forces pour la fin n'a plus de sens quand la fin est là
        mk(raisons, 'forces', 'Je veux garder des forces pour la fin', (1.5 + 1.5 * it.sprintFocus) * smoothstep(500, 2500, d));
        mk(raisons, 'reserve', 'Ma réserve est basse', 4 * it.reserveBasse);
        mk(raisons, 'dejaRoule', "J'ai déjà roulé plus que ce que j'ai vu des autres", 2.5 * it.excesRelais);
        mk(raisons, 'budget', "Ma réserve ne suffira pas pour le reste de l'étape : j'économise", 3 * budgetBas);
        if (enTete) {
          mk(raisons, 'reculer', 'Je suis devant : pour m\'abriter il faut que je recule', -0.5);
          mk(raisons, 'inconfort', `Mener à cette allure me coûterait ${Math.round(it.effortRequis * 100)} % du FTP, au-dessus de mon plancher de ${Math.round(it.plancher * 100)} %`, 3.0 * clamp((it.effortRequis - it.plancher) / 0.1, 0, 1));
        }
        break;
      }
      case 'placer': {
        if (cuit) vetos.push('Je suis cuit : plus de réserve pour remonter');
        if (sansExplosif) vetos.push("Je n'ai plus d'explosivité");
        if (p.moi.decroche) vetos.push("Je suis décroché : j'ai quelqu'un à rattraper");
        if (p.moi.rangDansGroupe <= 1) vetos.push('Je suis déjà aux avant-postes de mon groupe');
        if (p.rivaux.attaque) vetos.push(`${p.rivaux.attaque.letter} attaque : ça part, trop tard pour se placer`);
        mk(raisons, 'proche', "L'arrivée approche : je veux être bien placé", 4 * (1 - smoothstep(1500, 6000, d)));
        if (it.colDevant) mk(raisons, 'col', `Une montée qui compte arrive dans ${(it.colDevant.distance / 1000).toFixed(1).replace('.', ',')} km : je veux être bien placé à son pied`, 2.5 * it.colDevant.montee.poids * (1 - smoothstep(1500, 4000, it.colDevant.distance)));
        mk(raisons, 'danger', `${it.dangerLetter ?? 'Un rival'} est dangereux : je reste près de l'avant`, 1.0 * it.dangerMax);
        mk(raisons, 'sprint', 'Mon sprint se joue sur la position', 1.5 * it.sprintFocus * (1 - smoothstep(1000, 5000, d)));
        mk(raisons, 'reserve', 'Ma réserve est basse', -3 * it.reserveBasse);
        mk(raisons, 'explosivite', 'Mon explosivité est basse', -3 * it.explosiviteBasse);
        mk(raisons, 'cout', 'Remonter par le côté coûte cher', -1.0);
        break;
      }
      case 'participer': {
        if (cuit) vetos.push('Je suis cuit : plus de réserve pour rouler devant');
        if (p.moi.decroche) vetos.push("Je suis décroché : j'ai déjà quelqu'un à rattraper devant moi");
        if (it.dangerMax > 0.2)
          mk(raisons, 'user', `Pour gagner, je dois user ${it.dangerLetter} : plus la course est dure, moins il aura de jambes à la fin`, 2.5 * clamp((it.dangerMax - prof.pointe) / 0.3, 0, 1) * smoothstep(1500, 6000, d));
        if (enTete) {
          mk(raisons, 'devant', 'Je suis devant : personne à qui prendre la roue', 1.5);
          // sans raison de faire autre chose, je roule à ce que je peux tenir sans me cramer
          mk(raisons, 'plancher', `Tenir cette allure en tête me coûte ${Math.round(it.effortRequis * 100)} % du FTP : dans mon plancher, rien ne m'oblige à ralentir`, 3.5 * clamp((it.plancher + 0.03 - it.effortRequis) / 0.08, 0, 1));
        }
        mk(raisons, 'jambes', 'Mes jambes sont bonnes', 1.2 * clamp((p.moi.reserve - 0.5) / 0.35, 0, 1));
        {
          const vVoulue = vitesseVoulue(r, effortParticiper(p, it, prof)), allure = p.rivaux.allure;
          mk(raisons, 'rythme', `Le groupe va à ${(allure * 3.6).toFixed(0)} km/h, je peux tenir ${(vVoulue * 3.6).toFixed(0)} km/h sans me cramer : je ne laisse pas la course s'endormir`, TUNE.envieRouler * clamp((vVoulue - allure) / 1.5, 0, 1) * (1 - it.reserveBasse));
        }
        mk(raisons, 'reserve', 'Ma réserve est basse', -4.5 * it.reserveBasse);
        mk(raisons, 'rasLeBol', "Je suis presque le seul à rouler depuis longtemps", -4.5 * it.rasLeBol);
        mk(raisons, 'budget', "Ma réserve ne suffira pas pour le reste de l'étape", -3 * budgetBas);
        break;
      }
      case 'attaquer': {
        const sprintD = distanceSprint(r);
        // un sprint lancé se termine : la distance qu'il me reste ne se compare plus à ce que mon explosivité (qui baisse) me permettrait de lancer
        const enSprint = r.intent.kind === 'attaquer' && r.intent.sprint;
        // à l'approche de la ligne on ne ménage plus rien : être « cuit » n'interdit pas de finir son sprint
        if (cuit && !(d <= sprintD) && !enSprint) vetos.push('Je suis cuit : plus de réserve pour attaquer');
        if (sansExplosif && !enSprint) vetos.push("Je n'ai plus d'explosivité");
        if (p.moi.decroche && !(d <= sprintD) && !enSprint) vetos.push("Je suis décroché : j'ai quelqu'un à rattraper avant d'attaquer");
        const fenetre = smoothstep(500, 1200, d) * (1 - smoothstep(4000, 9000, d));
        const dmax = 3000 + 4000 * prof.agressivite;
        // « je viens déjà d'essayer » vise les tentatives précédentes, pas l'attaque que je suis en train de mener
        const dernier = r.intent.kind === 'attaquer' ? 0 : clamp(1 - (w.t - r.stats.lastAttackT) / 600, 0, 1);
        mk(raisons, 'pointe', 'Ma pointe de vitesse ne me permet pas de gagner au sprint', 1.5 * clamp((0.6 - prof.pointe) / 0.3, 0, 1));
        mk(raisons, 'distance', 'Il reste peu de distance, mais assez pour tenter', 1.5 * fenetre);
        mk(raisons, 'agressif', 'Mon tempérament est agressif', 2.3 * prof.agressivite);
        if (it.dangerMax > 0.2)
          mk(raisons, 'sprinteur', `${it.dangerLetter} a l'air dangereux`, 1.0 * clamp((it.dangerMax - prof.pointe) / 0.3, 0, 1));
        mk(raisons, 'explosivite', "Mon explosivité est basse", -5 * it.explosiviteBasse);
        // « trop tôt » vaut moins quand on est dans la montée qui décide de la finale
        mk(raisons, 'tropTot', 'Trop tôt : il reste trop de kilomètres', -4 * clamp((d - dmax) / dmax, 0, 1) * (1 - 0.8 * poidsCol));
        if (it.colEnCours && p.course.pente >= 3) mk(raisons, 'col', `Je suis dans la montée qui compte (${it.colEnCours.pente.toFixed(1).replace('.', ',')} %) et la côte est mon terrain`, 3 * poidsCol * clamp((aptMontagne - 0.98) / 0.1, 0, 1));
        mk(raisons, 'budget', "Ma réserve ne suffira pas pour le reste de l'étape", -2 * budgetBas);
        mk(raisons, 'peuFrais', 'Trop de coureurs ont encore l\'air frais pour que ça passe', -2 * it.fractionFrais);
        mk(raisons, 'dejaEssaye', "Je viens déjà d'essayer", -4.5 * dernier);
        if (r.intent.kind === 'attaquer' && !r.intent.sprint) {
          const avance = it.avanceSurVus;
          mk(raisons, 'passe', `Je suis parti et j'ai ${Math.round(avance)} m d'avance : ça passe`, 4 * clamp(avance / 25, 0, 1));
          mk(raisons, 'suivi', "On me suit : ça ne passe pas", -3 * clamp(1 - avance / 15, 0, 1));
        }
        if ((d <= sprintD || enSprint) && d > 0) mk(raisons, 'sprint', `Il reste ${Math.round(d)} m : ${enSprint ? 'je suis lancé, je vais au bout' : 'je lance mon sprint'}`, 9);
        break;
      }
      case 'suivre': {
        const a = p.rivaux.attaque;
        if (!a) vetos.push("Personne n'attaque, à ce que je vois");
        if (cuit) vetos.push('Je suis cuit : je ne peux pas suivre');
        if (sansExplosif) vetos.push("Je n'ai plus d'explosivité");
        if (p.moi.decroche) vetos.push("Je suis décroché : je dois d'abord rattraper le coureur devant");
        const danger = a ? Math.max(0.5, it.autres.find((o) => o.id === a.id)?.danger ?? 0) : 0.6;
        mk(raisons, 'rival', `${a ? a.letter : 'Le coureur'} est un rival direct`, 2.0 * danger);
        mk(raisons, 'frais', 'Je suis encore frais', 2.0 * clamp((p.moi.reserve - 0.3) / 0.4, 0, 1));
        mk(raisons, 'proche', "Il reste peu de distance : je ne peux pas le laisser partir", 3.0 * (1 - smoothstep(3000, 9000, d)));
        mk(raisons, 'tropLoin', 'Il reste trop de kilomètres : les autres vont le reprendre', -2.5 * clamp((d - 9000) / 6000, 0, 1));
        mk(raisons, 'explosivite', "Mon explosivité est basse", -4 * it.explosiviteBasse);
        mk(raisons, 'cuit', 'Je suis cuit', -5 * it.reserveBasse);
        mk(raisons, 'sprint', 'Je garde mon explosivité pour le sprint', -3.0 * it.sprintFocus * (d > 1500 ? 1 : 0.3));
        mk(raisons, 'laisserPartir', 'Si je le laisse partir, je ne pourrai pas gagner au sprint', 3.0 * it.sprintFocus * (1 - smoothstep(1000, 3000, d)));
        // courir après quelqu'un qui a déjà de l'avance, c'est brûler son explosivité sans reprendre sa roue ; s'il est parti de loin, il va faiblir : je garde mes forces pour mon propre lancement
        if (a) mk(raisons, 'avance', `${a.letter} a déjà ${Math.round(a.avance)} m d'avance : me griller pour le suivre ne sert à rien, il va faiblir`, -4 * clamp((a.avance - 12) / 25, 0, 1));
        break;
      }
      case 'gerer': {
        if (!p.moi.decroche) vetos.push("Je ne suis pas décroché : j'ai quelqu'un à ma portée");
        mk(raisons, 'lache', 'Je ne peux plus suivre le rythme', 1.5);
        mk(raisons, 'reserve', 'Ma réserve est basse', 3 * it.reserveBasse);
        mk(raisons, 'loin', 'Le coureur devant est loin', 3.5 * clamp(p.moi.ecartDevant / 300, 0, 1));
        break;
      }
      case 'revenir': {
        if (!p.moi.decroche) vetos.push("Je ne suis pas décroché : j'ai quelqu'un à ma portée");
        if (cuit) vetos.push('Je suis cuit : je ne peux pas revenir');
        mk(raisons, 'ecart', 'Le coureur devant est tout proche', 4 * clamp(1 - p.moi.ecartDevant / 250, 0, 1));
        mk(raisons, 'arrivee', "L'arrivée est proche : je me bats jusqu'au bout", 2 * (1 - smoothstep(1500, 5000, d)));
        mk(raisons, 'sprint', 'Je garde mon explosivité pour le sprint', -1.5 * it.sprintFocus);
        mk(raisons, 'jus', "Il me reste du jus", 3 * clamp((p.moi.reserve - 0.15) / 0.3, 0, 1));
        mk(raisons, 'cout', 'Revenir coûte cher', -1.0);
        break;
      }
    }
    // limite atteinte (déclarée par Agir) : l'action en cours coûte plus que ce que je m'étais fixé
    if (r.intent.kind === k && p.moi.evenements.includes('limite-atteinte') && (k === 'participer' || k === 'placer' || k === 'suivre' || k === 'revenir' || (k === 'attaquer' && !r.intent.sprint)))
      mk(raisons, 'limite', "J'ai atteint la limite d'effort ou de fatigue que je m'étais fixée pour cette action", -3);
    out.push({ intention: k, score: raisons.reduce((s, q) => s + q.valeur, 0), raisons, vetos });
  }
  return out;
}

export const nomProfil = (r: Rider) => `Coureur ${r.letter}, ${ARCHETYPE_LABEL[r.archetype]}`;
