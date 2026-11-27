import type { Raison, Volonte, Volontes, Vouloir } from '../../contrats/index.ts';
import { memeCadre } from './cadre.ts';
import { detecterEvenements } from './evenements.ts';
import { evaluerIntention, evaluerManoeuvre, evaluerObjectif } from './niveaux.ts';

/**
 * Étage 3 : pile à trois niveaux.
 * - Chaque niveau garde sa volonté jusqu'à sa réévaluation : première fois, échéance, déclencheur qui
 *   vient d'apparaître, ou cadre reçu modifié.
 * - Quand un niveau constate une impossibilité, le niveau JUSTE au-dessus se réévalue tout de suite
 *   (au plus une fois par pas), puis les niveaux en dessous, dont le cadre a pu changer.
 */
export const vouloir: Vouloir = (croyances, memoire) => {
  const t = croyances.instant_s;
  const evenements = detecterEvenements(croyances);
  const nouveaux = evenements.filter((e) => !memoire.evenementsPrecedents.includes(e));
  const prev = memoire.courantes;

  const cause = (v: Volonte | undefined): string | null => {
    if (v === undefined) return 'premiere_evaluation';
    if (v.echeance_s !== null && t >= v.echeance_s) return 'echeance';
    const d = v.declencheurs.find((x) => nouveaux.includes(x));
    return d !== undefined ? `declencheur:${d}` : null;
  };

  // 1. De haut en bas
  const causeO = cause(prev?.objectif);
  let objectif = causeO || !prev ? evaluerObjectif(croyances, causeO ?? 'premiere_evaluation', null) : prev.objectif;

  const cadreIntentionChange = prev ? !memeCadre(prev.objectif.cadre, objectif.cadre) : true;
  const causeI = cause(prev?.intention) ?? (cadreIntentionChange ? 'cadre_modifie' : null);
  let intention = causeI || !prev
    ? evaluerIntention(croyances, objectif.cadre, causeI ?? 'premiere_evaluation', null)
    : prev.intention;

  const cadreManoeuvreChange = prev ? !memeCadre(prev.intention.cadre, intention.cadre) : true;
  const causeM = cause(prev?.manoeuvre) ?? (cadreManoeuvreChange ? 'cadre_modifie' : null);
  let manoeuvre = causeM || !prev ? evaluerManoeuvre(croyances, intention, causeM ?? 'premiere_evaluation') : prev.manoeuvre;

  // 2. De bas en haut : remontée d'impossibilité, immédiate, un seul niveau à la fois.
  //    Seule une impossibilité NOUVELLE (constatée à ce pas) remonte ; celle qui dure a déjà été traitée.
  let intentionSollicitee = false;
  let objectifSollicite = false;
  let remonteeDeLaManoeuvre: Raison | null = null; // gardée : l'intention doit s'en souvenir si elle est réévaluée à nouveau
  for (let tour = 0; tour < 2; tour++) {
    if (manoeuvre.impossibilite && !intentionSollicitee) {
      intentionSollicitee = true;
      remonteeDeLaManoeuvre = manoeuvre.impossibilite;
      intention = evaluerIntention(croyances, objectif.cadre, 'impossibilite_remontee', manoeuvre.impossibilite);
      manoeuvre = evaluerManoeuvre(croyances, intention, 'cadre_modifie');
    } else if (intention.impossibilite && intention.evalueeA_s === t && !objectifSollicite) {
      objectifSollicite = true;
      objectif = evaluerObjectif(croyances, 'impossibilite_remontee', intention.impossibilite);
      intention = evaluerIntention(croyances, objectif.cadre, 'cadre_modifie', remonteeDeLaManoeuvre);
      manoeuvre = evaluerManoeuvre(croyances, intention, 'cadre_modifie');
    } else {
      break;
    }
  }

  const sortie: Volontes = { etage: 'volontes', instant_s: t, objectif, intention, manoeuvre };
  const visee_w = manoeuvre.visees.find((x) => x.grandeur === 'puissanceVisee_w')?.valeur ?? 0;
  const raisons: Raison[] = [objectif, intention, manoeuvre].flatMap((n) =>
    n.raisons.map((r) => ({ code: `${n.niveau}:${r.code}`, explication: `[${n.niveau}] ${r.explication}` })),
  );
  return {
    sortie,
    memoire: { courantes: sortie, evenementsPrecedents: evenements },
    resume: `${objectif.but} > ${intention.but} > ${manoeuvre.but} (${visee_w.toFixed(0)} W)`,
    raisons,
  };
};
