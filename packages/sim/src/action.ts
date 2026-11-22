/* =====================================================================
   Agir : comment le coureur réalise concrètement son intention
   (où il se place sur la route, à quelle puissance). Aucune décision ici.
   Le contrat vient de « Vouloir » (effort visé, effort max, fatigue max) ; l'état d'exécution (le « geste ») est propre à Agir ;
   ce qui remonte vers « Vouloir » est déclaré sous forme d'événements (docs/v0.0.3-comportement.md §4.1-4.2). Agir ne modifie jamais l'intention.
   Le placement est continu sur toute la largeur de la route ; la file suit l'axe défini dans placement.ts.
   ===================================================================== */
import type { EvenementAgir, Intention, Rider, World } from './types';
import { capExplosif, FREINAGE_MAX, puissanceVers, RIDER_LEN, vitesseSolo, wattsPour } from './physics';
import { axeY, decalage, enLigne, limiter, placeDansLaFile, roueEnLigne, yDescendant, yMontant } from './placement';
import { clamp } from './util';
import { libellePalier } from './paliers';

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

/** Suivre une roue : vitesse cible = celle de la roue + correction d'écart.
 *  L'effort n'est pas choisi : c'est la conséquence de la roue à tenir, dans la limite `effortMax` ; si la roue en demande plus, on le déclare. */
function suivre(w: World, roue: Rider, r: Rider, aMax = 1.2): number {
  const it = r.intent, ge = r.geste;
  const gap = roue.x - r.x - RIDER_LEN;
  // empressement : on vise une roue à ~0,5 m ; plus l'écart est grand, plus on rattrape vite (l'aspiration vaut jusqu'à ~38 % de puissance)
  const vDes = clamp(roue.v + 1.1 * (gap - 0.5), roue.v - 3, roue.v + 4);
  // l'abri a de la valeur : pour reprendre la roue on accepte de dépasser un peu l'effort soutenable, jusqu'à `effortMax`
  const urgence = clamp((gap - 1.0) / 4, 0, 1);
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

/** Position latérale dans le sillage de la roue qu'on suit (dérive avec le vent), avec l'habitude personnelle. */
function yAbrite(w: World, r: Rider, roue: Rider): number {
  return limiter(roue.y + Math.max(0, roue.x - r.x - RIDER_LEN) * w.vue.tanB + r.profile.lateral * 0.2);
}

/** Initialise le geste quand l'intention a changé (état d'exécution, propre à Agir). */
function initGeste(w: World, r: Rider) {
  const ge = r.geste, it = r.intent;
  if (ge.nature === it.kind) return;
  ge.nature = it.kind; ge.phaseSince = w.t; ge.surLimiteDepuis = -1; ge.enSuivi = false;
  ge.phase = it.kind === 'relais' ? 'passe' : it.kind === 'rabattre' ? 'decale' : it.kind === 'attaquer' ? 'burst' : '';
}

export function agir(w: World, r: Rider): Commande {
  const g = w.vue, it = r.intent, ge = r.geste;
  initGeste(w, r);
  // fatigue au-delà de la limite que je m'étais fixée : je le déclare (Vouloir réévaluera)
  if (it.kind && 1 - r.E > it.fatigueMax && w.t - ge.limiteT > 20) { ge.limiteT = w.t; declarer(w, r, 'limite-atteinte', 'fatigue'); }
  const watts = (e: number) => wattsPour(r, e);
  const pMax = watts(it.effortMax);
  switch (it.kind) {
    case 'relais': {
      const rivaux = autres(w, r);
      const xMax = rivaux.reduce((m, o) => Math.max(m, o.x), -1e9);
      // le coureur déjà en tête n'a personne à doubler ; un passeur doit avoir dépassé tous les autres de 3 m
      if (ge.phase !== 'tete' && (rivaux.length === 0 || r.x > xMax + 2.4 || (enLigne(w, r) && r.x > xMax))) {
        ge.phase = 'tete'; ge.phaseSince = w.t; declarer(w, r, 'passage-termine');
        // en tête on tient l'allure à laquelle les autres roulaient (médiane de leurs vitesses), dans la limite de ses moyens,
        // mais jamais en dessous de l'effort visé (sans plancher, chaque meneur prendrait l'allure ralentie du précédent)
        const vs = rivaux.map((o) => o.v).sort((p, q) => p - q);
        const vAutres = vs.length ? vs[Math.floor(vs.length / 2)]! : r.v;
        const vVise = vitesseSolo(watts(it.effort ?? 0.83), r.profile.cda, r.profile.mass, r.hw);
        ge.vHold = Math.max(vAutres, vVise);
      }
      if (ge.phase === 'tete') {
        return { yT: limiter(g.yTete + r.profile.lateral * 0.3), p: Math.min(pMax, puissanceVers(ge.vHold, r.v, r, 1.0)) };
      }
      ge.phase = 'passe';
      const vMeneur = g.meneur ? g.meneur.v : g.vitesse;
      return { yT: yMontant(w, r), p: Math.min(pMax, puissanceVers(vMeneur + 0.9, r.v, r, 1.3)) };
    }
    case 'rabattre': {
      const file = autres(w, r).filter((o) => enLigne(w, o));
      const queueX = file.length ? file.reduce((m, o) => Math.min(m, o.x), 1e9) : -1e9;
      if (ge.phase === 'decale' && file.length && r.x <= queueX - 3.0) { ge.phase = 'rejoint'; ge.phaseSince = w.t; declarer(w, r, 'rejoint'); }
      if (ge.phase === 'rejoint') return { yT: placeDansLaFile(w, r), p: Math.min(pMax, puissanceVers(g.vitesse - 0.4, r.v, r)) };
      ge.phase = 'decale';
      // tant qu'il n'est pas sorti de la file, il garde l'allure (sinon toute la file derrière freine avec lui) ; puis il se laisse glisser
      const libre = !enLigne(w, r, 1.1);
      return { yT: yDescendant(w, r), p: Math.min(pMax, puissanceVers(libre ? g.vitesse - 1.0 : g.vitesse, r.v, r)) };
    }
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
      if (a && a.status === 'course') {
        const gap = a.x - r.x - RIDER_LEN;
        const vDes = clamp(a.v + 0.4 * (gap - 1.0), a.v - 3, a.v + 1.5);
        return { yT: yAbrite(w, r, a), p: Math.min(pMax, puissanceVers(vDes, r.v, r, 1.4, FREINAGE_MAX)) };
      }
      return defaut(w, r);
    }
    case 'gerer':
      return { yT: limiter(r.profile.lateral), p: watts(it.effort ?? 0.78) };
    case 'revenir': {
      const dev = devantAuClassement(w, r);
      const vDes = (dev ? dev.v : g.vitesse) + 1.0;          // on rattrape le coureur juste devant
      return { yT: placeDansLaFile(w, r), p: Math.min(pMax, puissanceVers(vDes, r.v, r, 1.5)) };
    }
    case 'abriter':
    default:
      return defaut(w, r);
  }
}

/** Comportement de base : se placer dans le sillage de la roue devant et la suivre, sinon tenir l'allure. */
function defaut(w: World, r: Rider): Commande {
  const roue = roueEnLigne(w, r);
  if (roue) return { yT: yAbrite(w, r, roue), p: suivre(w, roue, r) };
  return { yT: placeDansLaFile(w, r), p: Math.min(wattsPour(r, 1), puissanceVers(Math.max(w.vue.vitesse, r.v - 0.3), r.v, r)) };
}

/** Phrase d'« Agir » pour la trace (§6.5 : « je me place derrière le rouleur, effort minimal »). */
export function decrireAction(w: World, r: Rider, k: Intention): string {
  const kmh = Math.round(r.v * 3.6);
  const cote = Math.abs(w.vue.tanB) > 0.12 ? ' (dans le sillage, à l’abri du vent de côté)' : '';
  switch (k) {
    case 'abriter': {
      const roue = roueEnLigne(w, r);
      return roue ? `je me place derrière ${roue.letter}${cote}, effort minimal` : 'je reste dans la file, effort minimal';
    }
    case 'relais':
      return r.geste.phase === 'tete' ? `je roule en tête à ${kmh} km/h pour tenir l'allure` : `je passe devant les autres côté ${w.vue.coteMontant < 0 ? 'gauche' : 'droit'} pour prendre le relais`;
    case 'rabattre': return `je me décale ${w.vue.coteMontant < 0 ? 'à droite' : 'à gauche'}, je laisse passer et je me replace à l’abri dans la file`;
    case 'attaquer': return r.intent.sprint ? 'je lance le sprint à fond' : "j'accélère fort pour faire un écart";
    case 'suivre': { const a = r.intent.cible !== null ? w.riders[r.intent.cible] : null; return a ? `je saute dans la roue de ${a.letter}` : 'je suis le coureur qui attaque'; }
    case 'gerer': return `je roule à mon rythme (${libellePalier(r.intent.effort ?? 0.78)}, ≈ ${Math.round(wattsPour(r, r.intent.effort ?? 0.78))} W)`;
    case 'revenir': { const dev = devantAuClassement(w, r); return dev ? `je reviens sur ${dev.letter}, effort soutenu` : 'je reviens, effort soutenu'; }
  }
}
