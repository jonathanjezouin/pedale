import type { Cadre, Croyances, Raison, Visee, Volonte } from '../../contrats/index.ts';
import { TEMOIN, VOULOIR } from '../parametres.ts';
import { borner, borneDe, intersecter } from './cadre.ts';

const EXPLICATION_CAUSE: Record<string, string> = {
  premiere_evaluation: 'Première évaluation de ce niveau.',
  echeance: 'Mon échéance est atteinte.',
  cadre_modifie: 'Le cadre reçu du niveau supérieur a changé.',
  impossibilite_remontee: 'Le niveau en dessous ne peut plus tenir son cadre.',
};

/** Première raison de chaque niveau réévalué : POURQUOI il se réévalue maintenant. */
export function raisonDeCause(cause: string): Raison {
  const explication = cause.startsWith('declencheur:')
    ? `L'événement « ${cause.slice('declencheur:'.length)} » vient d'apparaître.`
    : (EXPLICATION_CAUSE[cause] ?? cause);
  return { code: `reevaluation:${cause}`, explication };
}

/** Niveau 1 : objectif de l'étape. Rarement réévalué (déclencheur seulement). */
export function evaluerObjectif(c: Croyances, cause: string, impossibilite: Raison | null): Volonte {
  const soutenable = c.soi.puissanceSoutenable_w;
  const enForce = c.resteAParcourir.distance_m < VOULOIR.seuilFinProche_m;
  const [but, ratio, raison, declencheurs]: [string, number, Raison, string[]] = impossibilite
    ? ['finir_sans_forcer', VOULOIR.plafondObjectifPrudent_ratio,
       { code: 'survie', explication: `Mon intention ne tient plus (${impossibilite.explication}) : je finis sans forcer.` },
       ['fin_de_piste_proche']]
    : enForce
      ? ['finir_en_force', VOULOIR.plafondObjectifEnForce_ratio,
         { code: 'arrivee_proche', explication: 'L’arrivée est proche : je peux me permettre de forcer.' }, []]
      : ['finir_la_piste', VOULOIR.plafondObjectifNormal_ratio,
         { code: 'consigne_unique', explication: 'Je n’ai qu’une chose à faire : avancer jusqu’au bout.' },
         ['fin_de_piste_proche']];
  return {
    niveau: 'objectif',
    evalueeA_s: c.instant_s,
    but,
    raisons: [raisonDeCause(cause), raison],
    visees: [],
    cadre: [{ grandeur: 'puissanceVisee_w', min: 0, max: soutenable * ratio }],
    echeance_s: null,
    declencheurs,
    impossibilite: null,
  };
}

/** Niveau 2 : intention (minutes). Reçoit le cadre de l'objectif, donne celui de la manœuvre. */
export function evaluerIntention(
  c: Croyances, cadreRecu: Cadre, cause: string, remontee: Raison | null,
): Volonte {
  const raisons: Raison[] = [raisonDeCause(cause)];
  let cible_m_s: number = TEMOIN.vitesseCible_m_s;
  let but = 'tenir_la_vitesse_cible';
  if (remontee?.code === 'cadre_puissance_atteint') {
    cible_m_s = c.soi.vitesse_m_s;
    but = 'tenir_la_vitesse_acceptee';
    raisons.push({
      code: 'impossibilite_remontee',
      explication: `La manœuvre ne tient plus (${remontee.explication}) : j’accepte de rouler à ${(cible_m_s * 3.6).toFixed(0)} km/h.`,
    });
  } else {
    raisons.push({
      code: 'vitesse_cible',
      explication: `Je veux rouler autour de ${(cible_m_s * 3.6).toFixed(0)} km/h sans dépasser ma puissance soutenable de plus de 15 %.`,
    });
  }
  const propre: Cadre = [{ grandeur: 'puissanceVisee_w', min: 0, max: c.soi.puissanceSoutenable_w * TEMOIN.margeCadrePuissance_ratio }];
  const vide = c.soi.reserveLongueEstimee_ratio <= VOULOIR.seuilReserveVide_ratio;
  return {
    niveau: 'intention',
    evalueeA_s: c.instant_s,
    but,
    raisons,
    visees: [{ grandeur: 'vitesseVisee_m_s', valeur: cible_m_s }],
    cadre: intersecter(cadreRecu, propre),
    echeance_s: c.instant_s + VOULOIR.cadenceIntention_s,
    declencheurs: ['reserve_basse'],
    impossibilite: vide
      ? { code: 'reserve_vide', explication: 'Ma réserve est vide : je ne peux plus tenir de vitesse.' }
      : null,
  };
}

/** Niveau 3 : manœuvre (secondes). Cherche la bonne puissance à l'intérieur du cadre de l'intention. */
export function evaluerManoeuvre(c: Croyances, intention: Volonte, cause: string): Volonte {
  const cible_m_s = intention.visees.find((x) => x.grandeur === 'vitesseVisee_m_s')?.valeur ?? TEMOIN.vitesseCible_m_s;
  const v = c.soi.vitesse_m_s;
  const demandee_w = TEMOIN.puissanceEntretien_w + TEMOIN.gainPuissance_w_par_m_s * (cible_m_s - v);
  const visee_w = borner(demandee_w, 'puissanceVisee_w', intention.cadre);
  const tropLent = v < cible_m_s - TEMOIN.toleranceVitesse_m_s;
  const plafonne = demandee_w > visee_w;

  const raisons: Raison[] = [
    raisonDeCause(cause),
    tropLent
      ? { code: 'trop_lent', explication: 'Je suis plus lent que ma vitesse visée : j’augmente ma puissance.' }
      : { code: 'vitesse_ok', explication: 'Ma vitesse est proche de la vitesse visée : j’entretiens.' },
  ];
  if (plafonne) raisons.push({ code: 'plafond_du_cadre', explication: 'Ma puissance est bornée par le cadre de mon intention.' });

  const visees: Visee[] = [
    { grandeur: 'puissanceVisee_w', valeur: visee_w },
    { grandeur: 'positionLateraleVisee_m', valeur: borner(0, 'positionLateraleVisee_m', intention.cadre) },
  ];
  // Impossibilité réelle : le cadre ne laisse pas même la puissance qui TIENT la vitesse visée.
  // (Demander plus que le plafond pour accélérer, c'est normal : on est simplement plafonné.)
  const plafond_w = borneDe(intention.cadre, 'puissanceVisee_w')?.max ?? Infinity;
  const impossible = tropLent && plafond_w < TEMOIN.puissanceEntretien_w;
  return {
    niveau: 'manoeuvre',
    evalueeA_s: c.instant_s,
    but: tropLent ? 'accelerer' : 'entretenir',
    raisons,
    visees,
    cadre: [],
    echeance_s: c.instant_s, // réévaluée à chaque pas
    declencheurs: [],
    impossibilite: impossible
      ? {
          code: 'cadre_puissance_atteint',
          explication: `Mon cadre (${plafond_w.toFixed(0)} W) ne suffit pas à tenir ${(cible_m_s * 3.6).toFixed(0)} km/h (${TEMOIN.puissanceEntretien_w} W).`,
        }
      : null,
  };
}
