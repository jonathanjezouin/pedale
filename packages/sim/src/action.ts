/* =====================================================================
   Agir : comment le coureur réalise concrètement son intention
   (où il se place sur la route, à quelle puissance). Aucune décision ici.
   Le contrat vient de « Vouloir » (effort visé, effort max, fatigue max) ; l'état d'exécution (le « geste ») est propre à Agir ;
   ce qui remonte vers « Vouloir » est déclaré sous forme d'événements (docs/v0.0.3-comportement.md §4.1-4.2). Agir ne modifie jamais l'intention.
   Le placement est continu sur toute la largeur de la route ; la file suit l'axe défini dans placement.ts.
   ===================================================================== */
import type { EvenementAgir, Intention, Rider, World } from './types';
import { PLACE_LABEL } from './types';
import { aspirationValeur, capExplosif, FREINAGE_MAX, puissanceVers, RIDER_LEN, vitesseSolo, wattsPour } from './physics';
import { abrite, axeY, decalage, enLigne, limiter, placeDansLaFile, roueEnLigne, yDescendant, yMontant } from './placement';
import { clamp } from './util';
import { libellePalier } from './paliers';
import { bruitDe, gauss } from './observation';

export interface Commande { p: number; yT: number }

const autres = (w: World, r: Rider): Rider[] => w.vue.ordre.filter((o) => o !== r);

/** Coureur juste devant moi au classement (quel que soit son couloir). */
const devantAuClassement = (w: World, r: Rider): Rider | null => { const i = w.vue.ordre.indexOf(r); return i > 0 ? w.vue.ordre[i - 1]! : null; };

/** Le couloir (+1 montant / −1 descendant) est-il libre autour de moi ? (on compte aussi ceux qui s'y dirigent) */
function couloirLibre(w: World, r: Rider, cote: 1 | -1): boolean {
  const off = decalage(r, true), sMont = w.vue.coteMontant;
  return !w.vue.ordre.some((o) => {
    if (o === r || Math.abs(o.x - r.x) >= 9) return false;
    const yLane = axeY(w, o.x) + cote * sMont * off;
    return Math.abs(o.y - yLane) < 0.9 || (o.intent.sprint && o.geste.phase === 'couloir' && o.geste.side === cote);
  });
}

/** Déclarer un événement à « Vouloir » (jamais de modification de l'intention). */
function declarer(w: World, r: Rider, type: EvenementAgir, detail?: string) {
  r.evenements.push({ type, t: w.t, detail });
  if (r.evenements.length > 8) r.evenements.shift();
}

/** La roue que je suis : celle que Vouloir a choisie (si elle m'abrite encore), sinon la plus proche dans la file. */
function roueChoisie(w: World, r: Rider): Rider | null {
  const c = r.intent.cible;
  if (c !== null && r.intent.kind !== 'suivre') {
    const o = w.riders[c];
    if (o && o.status === 'course' && o.x > r.x && enLigne(w, o, 0.9) && abrite(w, o, r, 1.5, 40)) return o;
  }
  return roueEnLigne(w, r);
}

/** Je me cale sur une roue : si c'est une autre qu'avant, mon filtre de vitesse et ma recherche d'abri repartent de zéro. */
function lierRoue(w: World, r: Rider, roue: Rider) {
  const ge = r.geste;
  if (ge.roueId === roue.id) return;
  ge.roueId = roue.id; ge.vRoue = roue.v; ge.aRoue = 0; ge.dyAbri = 0; ge.sensAbri = 1; ge.abriPrev = r.draft; ge.abriT = w.t; ge.latErr = 0;
}

/** Suivre une roue : vitesse cible = celle de la roue (telle que je la perçois, avec mon délai) + correction d'écart.
 *  L'effort n'est pas choisi : c'est la conséquence de la roue à tenir, dans la limite `effortMax` ; si la roue en demande plus, on le déclare. */
function suivre(w: World, roue: Rider, r: Rider, aMax = 1.2): number {
  const it = r.intent, ge = r.geste, ex = r.exec;
  lierRoue(w, r, roue);
  const vAvant = ge.vRoue;
  ge.vRoue += (roue.v - ge.vRoue) * (1 - Math.exp(-w.cfg.dt / Math.max(0.05, ex.delai)));      // délai de réaction
  // anticipation (v0.1.1) : j'estime l'accélération de la roue (dérivée filtrée de ce que je perçois de sa vitesse) et je vise où elle sera
  // dans le temps que je mets à réagir, au lieu d'attendre que l'écart se creuse. Un coureur expérimenté (délai court) lit mieux.
  ge.aRoue += ((ge.vRoue - vAvant) / w.cfg.dt - ge.aRoue) * (1 - Math.exp(-w.cfg.dt / 0.5));
  const gap = roue.x - r.x - RIDER_LEN;
  const vAnticipee = ge.vRoue + clamp(ge.aRoue, 0, 2) * (ex.delai + 0.6);
  // empressement : on vise une roue à son écart de confort ; plus l'écart est grand, plus on rattrape vite (l'aspiration vaut jusqu'à ~38 % de puissance)
  const vDes = clamp(vAnticipee + 1.1 * (gap - ex.ecartConfort), ge.vRoue - 3, ge.vRoue + 4);
  // l'abri a de la valeur : pour reprendre la roue on accepte de dépasser un peu l'effort soutenable, jusqu'à `effortMax` (dès 0,8 m d'écart, plein à 3,5 m ; avant : 5 m).
  // Cette valeur est celle de l'abri que je retrouverais à mon écart de confort : sans aspiration, rien ne justifie de forcer.
  const valeurAbri = clamp(aspirationValeur(ex.ecartConfort, 0) / 0.3, 0, 1);
  const urgence = valeurAbri * clamp((gap - 0.8) / 2.7, 0, 1);
  const base = wattsPour(r, Math.min(1, it.effortMax));
  const lim = Math.min(capExplosif(r), base * (1 + Math.max(0, it.effortMax - 1) * urgence));
  const pDes = puissanceVers(vDes, r.v, r, aMax * 1.5, FREINAGE_MAX);      // un suiveur peut freiner pour ne pas toucher la roue
  // ce que demande la roue dépasse-t-il ce que j'accepte ? (au moins 3 s d'affilée, pour ne pas déclarer chaque à-coup)
  if (pDes > lim * 1.03) {
    if (ge.surLimiteDepuis < 0) ge.surLimiteDepuis = w.t;
    if (w.t - ge.surLimiteDepuis >= 3 && w.t - ge.limiteT > 10) { ge.limiteT = w.t; declarer(w, r, 'limite-atteinte', 'effort'); }
  } else ge.surLimiteDepuis = -1;
  // roue perdue : l'écart s'est creusé au-delà de 6 m alors que je suivais de près
  if (gap < 4) ge.enSuivi = true;
  else if (gap > 6 && ge.enSuivi && w.t - ge.roueT > 10) { ge.enSuivi = false; ge.roueT = w.t; declarer(w, r, 'roue-perdue', `${roue.letter} à ${Math.round(gap)} m`); }
  return Math.min(lim, pDes);
}

/** Position latérale pour s'abriter derrière une roue. Le coureur ne connaît pas la forme du sillage : il part d'un a priori grossier
 *  (derrière la roue, un peu côté sous le vent), ressent son abri (bruité) et fait une recherche locale : un petit pas, on garde si l'abri
 *  augmente, on repart dans l'autre sens sinon (docs/v0.0.3-comportement.md §4.4). */
function yAbrite(w: World, r: Rider, roue: Rider): number {
  const ge = r.geste, ex = r.exec;
  lierRoue(w, r, roue);
  if (w.t - ge.abriT >= 1.2) {
    const senti = r.draft + gauss(r.rng) * 0.012 * bruitDe(r);
    if (senti < ge.abriPrev - 0.004) ge.sensAbri = ge.sensAbri === 1 ? -1 : 1;
    ge.dyAbri = clamp(ge.dyAbri + ge.sensAbri * ex.pasAbri, -0.7, 0.7);
    ge.abriPrev = senti; ge.abriT = w.t;
  }
  ge.latErr = clamp(ge.latErr * 0.97 + gauss(r.rng) * ex.precisionLat * 0.15, -0.5, 0.5);        // précision d'exécution
  const gap = Math.max(0, roue.x - r.x - RIDER_LEN);
  return limiter(roue.y + 0.8 * gap * w.vue.tanB + ge.dyAbri + ge.latErr + r.profile.lateral * 0.2);
}

/** Initialise le geste quand l'intention a changé (état d'exécution, propre à Agir). */
function initGeste(w: World, r: Rider) {
  const ge = r.geste, it = r.intent;
  if (ge.nature === it.kind) return;
  ge.nature = it.kind; ge.phaseSince = w.t; ge.surLimiteDepuis = -1; ge.enSuivi = false; ge.place = null;
  ge.phase = it.kind === 'attaquer' ? 'burst' : '';
}

export function agir(w: World, r: Rider): Commande {
  const g = w.vue, it = r.intent, ge = r.geste;
  initGeste(w, r);
  // fatigue au-delà de la limite que je m'étais fixée : je le déclare (Vouloir réévaluera)
  if (it.kind && 1 - r.E > it.fatigueMax && w.t - ge.limiteT > 20) { ge.limiteT = w.t; declarer(w, r, 'limite-atteinte', 'fatigue'); }
  const watts = (e: number) => wattsPour(r, e);
  const pMax = watts(it.effortMax);
  switch (it.kind) {
    case 'attaquer': {
      if (it.sprint) {
        // on sort de la file une fois pour toutes dans un couloir libre, puis on tient son couloir jusqu'à la ligne
        if (ge.phase !== 'couloir') {
          ge.phase = 'couloir';
          ge.side = couloirLibre(w, r, 1) ? 1 : couloirLibre(w, r, -1) ? -1 : (r.y >= axeY(w, r.x) ? -1 : 1);
        }
        const y = axeY(w, r.x) + ge.side * g.coteMontant * decalage(r, true);
        return { yT: limiter(y), p: pMax };
      }
      if (ge.phase === 'burst' && w.t - ge.phaseSince >= 10) { ge.phase = 'sustain'; ge.phaseSince = w.t; declarer(w, r, 'fin-burst'); }
      // la puissance suit l'effort demandé par Vouloir : à fond au démarrage, puis l'effort soutenu qu'il choisit après « fin-burst »
      const pAtt = watts(it.effort ?? it.effortMax);
      if (ge.phase === 'burst') return { yT: yMontant(w, r, true), p: pAtt };
      const xMax = autres(w, r).reduce((m, o) => Math.max(m, o.x), -1e9);
      return { yT: r.x > xMax + 3 ? limiter(g.yTete) : yMontant(w, r, true), p: pAtt };
    }
    case 'suivre': {
      const a = it.cible !== null ? w.riders[it.cible] : undefined;
      // je saute dans la roue de l'attaquant avec l'empressement d'une prise de roue : plus l'écart est grand, plus je rattrape vite (l'abri vaut cher)
      if (a && a.status === 'course') return { yT: yAbrite(w, r, a), p: suivre(w, a, r, 1.4) };
      return enGroupe(w, r, pMax, watts);
    }
    case 'gerer':
      return { yT: limiter(r.profile.lateral), p: watts(it.effort ?? 0.78) };
    case 'revenir': {
      const dev = devantAuClassement(w, r);
      const vDes = (dev ? dev.v : g.vitesse) + 1.0;          // on rattrape le coureur juste devant
      return { yT: placeDansLaFile(w, r), p: Math.min(pMax, puissanceVers(vDes, r.v, r, 1.5)) };
    }
    case 'abriter':
    case 'placer':
    case 'participer':
    default:
      return enGroupe(w, r, pMax, watts);
  }
}

/** Quelqu'un est-il en train de se glisser dans la file juste devant moi ? Il est à ma hauteur (ou un peu devant), à côté de la file, à ma vitesse :
 *  il ne passe pas (il irait plus vite) et il ne se laisse pas glisser (il irait moins vite). Réflexe d'Agir, pas une décision. */
export function porteOuverte(w: World, r: Rider, m: Rider): boolean {
  if (m === r || m.status !== 'course') return false;
  const ecartAxe = Math.abs(m.y - axeY(w, m.x));
  return ecartAxe > 0.9 && ecartAxe < 2.2 && m.x - r.x > -1.0 && m.x - r.x < 2.4 && Math.abs(m.v - r.v) < 0.6;
}

/** Les gestes de groupe : passer en tête, reculer jusqu'à la queue, remonter près de l'avant, ou garder sa place
 *  (suivre une roue, et mener quand personne n'est devant). La place visée vient de Vouloir ; ici on ne fait que l'exécuter. */
function enGroupe(w: World, r: Rider, pMax: number, watts: (e: number) => number): Commande {
  const g = w.vue, it = r.intent, ge = r.geste;
  const groupe = g.groupes.find((gr) => gr.includes(r)) ?? [r];
  const aut = groupe.filter((o) => o !== r);
  const place = it.place;
  if (ge.place !== place) { ge.place = place; ge.phase = ''; ge.phaseSince = w.t; }
  const xMax = aut.reduce((m, o) => Math.max(m, o.x), -1e9);
  const devantG = aut.filter((o) => o.x > r.x);
  const vFront = devantG.length ? devantG.reduce((m, o) => (o.x > m.x ? o : m)).v : g.vitesse;

  // passer devant : on remonte par le côté jusqu'à avoir dépassé tous les autres de mon groupe
  if (place === 'tete' && aut.length) {
    const devant = !(r.x > xMax + 2.4 || (enLigne(w, r) && r.x > xMax));
    if (devant) {
      ge.phase = 'monte';
      // si je n'arrive pas à doubler (le meneur est plus fort que moi), je le déclare au bout de 20 s : Vouloir réévaluera
      if (w.t - ge.phaseSince > 20 && w.t - ge.limiteT > 10) { ge.limiteT = w.t; declarer(w, r, 'limite-atteinte', 'depassement'); }
      // je passe pour mener : je vise au moins la vitesse que je veux tenir à mon effort (sinon, quand tout le groupe est à l'arrêt, je viserais 0,9 m/s)
      const vVoulue = it.effort !== null ? vitesseSolo(watts(it.effort), r.profile.cda, r.profile.mass, r.hw, r.pente) : 0;
      return { yT: yMontant(w, r), p: Math.min(pMax, puissanceVers(Math.max(vFront + 0.9, vVoulue), r.v, r, 1.3)) };
    }
    if (ge.phase === 'monte') { ge.phase = 'garde'; declarer(w, r, 'passage-termine'); }
  }

  // me placer derrière un coureur (le dernier qui roule, la queue, un cran plus loin) :
  // 1. je m'écarte et je me laisse glisser en roue libre (on garde l'allure tant qu'on est dans la file, sinon elle freinerait avec nous),
  // 2. une fois derrière lui, je me cale sur sa roue et je reviens dans la file : celui qui était derrière lui m'ouvre la porte (réflexe, voir `porteOuverte`).
  if (place === 'derriere') {
    const tgt = it.cible !== null ? w.riders[it.cible] : undefined;
    if (tgt && tgt.status === 'course' && groupe.includes(tgt)) {
      // geste terminé ou abandonné, mais Vouloir vise toujours cette place : on repart au bout de 4 s s'il n'est pas déjà derrière lui
      if (ge.phase === 'garde' && w.t - ge.phaseSince > 4 && !(enLigne(w, r, 0.9) && tgt.x > r.x && tgt.x - r.x < 4.5)) ge.phase = '';
      if (ge.phase === '') { ge.phase = tgt.x > r.x ? 'fusion' : 'decale'; ge.phaseSince = w.t; }
      // je renonce si le geste n'aboutit pas : trop long (25 s), ou je me suis laissé distancer (je ne vais pas me faire décrocher pour une place)
      if ((ge.phase === 'decale' || ge.phase === 'fusion') && (w.t - ge.phaseSince > 25 || (r.ecartDevant > 15 && r.ecartDevant < 1e8))) { ge.phase = 'garde'; ge.phaseSince = w.t; declarer(w, r, 'place-atteinte', 'abandon'); }
      if (ge.phase === 'decale' && r.x <= tgt.x - (RIDER_LEN + 0.5)) { ge.phase = 'fusion'; ge.phaseSince = w.t; }
      // la cible est repassée derrière moi (elle a ralenti aussi) : je ne freine pas pour l'attendre, je continue de glisser
      if (ge.phase === 'fusion' && tgt.x < r.x - 1.0) { ge.phase = 'decale'; ge.phaseSince = w.t; }
      if (ge.phase === 'decale') {
        const libre = !enLigne(w, r, 1.1);
        // lever le pied, c'est rouler en roue libre (puissance ≥ 0) : freiner activement ferait freiner toute la file derrière
        return { yT: yDescendant(w, r), p: Math.max(0, Math.min(pMax, puissanceVers(libre ? g.vitesse - 1.0 : g.vitesse, r.v, r))) };
      }
      if (ge.phase === 'fusion') {
        const dedans = enLigne(w, r, 0.9) && tgt.x > r.x && tgt.x - r.x < 4.5;
        if (dedans) { ge.phase = 'garde'; ge.phaseSince = w.t; declarer(w, r, 'place-atteinte'); }
        else return { yT: placeDansLaFile(w, r), p: suivre(w, tgt, r) };
      }
    } else if (ge.phase !== 'garde') { ge.phase = 'garde'; declarer(w, r, 'place-atteinte', 'cible perdue'); }
  }

  // remonter près de l'avant, sans passer en tête
  if (place === 'avant' && aut.length) {
    if (devantG.length > 1 && ge.phase !== 'garde') { ge.phase = 'monte'; return { yT: yMontant(w, r), p: Math.min(pMax, puissanceVers(vFront + 0.6, r.v, r, 1.3)) }; }
    if (ge.phase === 'monte') { ge.phase = 'garde'; declarer(w, r, 'place-atteinte'); }
  }

  // porte ouverte : quelqu'un revient à ma hauteur par le côté, à la même vitesse, pour se glisser devant moi : je lève le pied pour lui faire de la place
  // (au plus 3 s par fenêtre de 9 s : si l'autre ne se glisse pas, je ne vais pas me faire décrocher pour lui)
  if (enLigne(w, r, 0.9) && aut.some((m) => porteOuverte(w, r, m))) {
    if (ge.porteDepuis < 0 || w.t - ge.porteDepuis > 9) ge.porteDepuis = w.t;
    if (w.t - ge.porteDepuis < 3) {
      const roue0 = roueChoisie(w, r);
      return { yT: roue0 ? yAbrite(w, r, roue0) : r.y, p: Math.max(0, Math.min(pMax, puissanceVers(r.v - 0.8, r.v, r))) };
    }
  }

  // garder sa place : suivre la roue ; sans roue (en tête de mon groupe, ou seul), mener si je participe, sinon tenir l'allure
  const roue = roueChoisie(w, r);
  if (roue) return { yT: yAbrite(w, r, roue), p: suivre(w, roue, r) };
  if (it.kind === 'participer' && it.effort !== null) {
    ge.roueId = null;
    // seul le premier du groupe vise la position de tête (côté du vent) ; derrière quelqu'un, on se met sur l'axe de la file, où l'on retrouvera sa roue
    return { yT: devantG.length ? placeDansLaFile(w, r) : limiter(g.yTete + r.profile.lateral * 0.3), p: Math.min(pMax, watts(it.effort)) };
  }
  ge.roueId = null;
  return { yT: placeDansLaFile(w, r), p: Math.min(wattsPour(r, 1), puissanceVers(Math.max(g.vitesse, r.v - 0.3), r.v, r)) };
}

/** Phrase d'« Agir » pour la trace (§6.5 : « je me place derrière le rouleur, effort minimal »). */
export function decrireAction(w: World, r: Rider, k: Intention): string {
  const kmh = Math.round(r.v * 3.6);
  const cote = Math.abs(w.vue.tanB) > 0.12 ? ' (dans le sillage, à l’abri du vent de côté)' : '';
  const place = r.intent.place;
  switch (k) {
    case 'abriter': {
      if (place === 'derriere') {
        const c = r.intent.cible !== null ? w.riders[r.intent.cible] : null;
        return w.vue.meneur === r ? `je suis devant : je m'écarte et je me laisse glisser derrière ${c ? c.letter : 'les autres'} pour m'abriter` : `je me place derrière ${c ? c.letter : 'un autre coureur'} : ça me coûte moins`;
      }
      const roue = roueChoisie(w, r);
      return roue ? `je me place derrière ${roue.letter}${cote}, effort minimal` : 'je reste dans la file, effort minimal';
    }
    case 'placer': return 'je remonte par le côté pour être près de l’avant, sans passer en tête';
    case 'participer': {
      if (place === 'derriere') { const c = r.intent.cible !== null ? w.riders[r.intent.cible] : null; return `j'ai fait mon tour : je m'écarte et je me replace derrière ${c ? c.letter : 'le dernier qui roule'}`; }
      if (place === 'tete') return `je passe devant les autres côté ${w.vue.coteMontant < 0 ? 'gauche' : 'droit'} pour mener`;
      const roue = roueChoisie(w, r);
      return roue ? `j'attends mon tour derrière ${roue.letter}` : `je mène à ${kmh} km/h (${libellePalier(r.intent.effort ?? 0.85)})`;
    }
    case 'attaquer': return r.intent.sprint ? 'je lance le sprint à fond' : "j'accélère fort pour faire un écart";
    case 'suivre': { const a = r.intent.cible !== null ? w.riders[r.intent.cible] : null; return a ? `je saute dans la roue de ${a.letter}` : 'je suis le coureur qui attaque'; }
    case 'gerer': return `je roule à mon rythme (${libellePalier(r.intent.effort ?? 0.78)}, ≈ ${Math.round(wattsPour(r, r.intent.effort ?? 0.78))} W)`;
    case 'revenir': { const dev = devantAuClassement(w, r); return dev ? `je reviens sur ${dev.letter}, effort soutenu` : 'je reviens, effort soutenu'; }
  }
}

export { PLACE_LABEL };
