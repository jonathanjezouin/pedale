import type { Cadre, Raison, Visee, Volonte, Vouloir } from '../../contrats/index.ts';
import { TEMOIN } from '../parametres.ts';

const borner = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

/** Étage 3, contenu trivial : un objectif, une intention, une manœuvre de régulation de la vitesse. */
export const vouloir: Vouloir = (croyances, _memoire) => {
  const t = croyances.instant_s;
  const v = croyances.soi.vitesse_m_s;

  const objectif: Volonte = {
    niveau: 'objectif',
    but: 'finir_la_piste',
    raisons: [{ code: 'consigne_unique', explication: 'Je n’ai qu’une chose à faire : avancer jusqu’au bout.' }],
    visees: [],
    cadre: [],
    echeance_s: null,
    declencheurs: [],
    impossibilite: null,
  };

  const plafond_w = croyances.soi.puissanceSoutenable_w * TEMOIN.margeCadrePuissance_ratio;
  const cadreIntention: Cadre = [{ grandeur: 'puissanceVisee_w', min: 0, max: plafond_w }];
  const intention: Volonte = {
    niveau: 'intention',
    but: 'tenir_la_vitesse_cible',
    raisons: [{
      code: 'vitesse_cible',
      explication: `Je veux rouler autour de ${(TEMOIN.vitesseCible_m_s * 3.6).toFixed(0)} km/h sans dépasser ma puissance soutenable de plus de 15 %.`,
    }],
    visees: [],
    cadre: cadreIntention,
    echeance_s: null,
    declencheurs: ['vitesse_cible_modifiee'],
    impossibilite: null,
  };

  const borne = cadreIntention.find((b) => b.grandeur === 'puissanceVisee_w');
  const demandee_w = TEMOIN.puissanceEntretien_w + TEMOIN.gainPuissance_w_par_m_s * (TEMOIN.vitesseCible_m_s - v);
  const visee_w = borner(demandee_w, borne?.min ?? 0, borne?.max ?? Infinity);
  const tropLent = v < TEMOIN.vitesseCible_m_s - TEMOIN.toleranceVitesse_m_s;
  const plafonne = demandee_w > visee_w;

  const raisons: Raison[] = [
    tropLent
      ? { code: 'trop_lent', explication: 'Je suis plus lent que ma vitesse cible : j’augmente ma puissance.' }
      : { code: 'vitesse_ok', explication: 'Ma vitesse est proche de la cible : j’entretiens.' },
  ];
  if (plafonne) {
    raisons.push({ code: 'plafond_du_cadre', explication: 'Ma puissance est bornée par le cadre de mon intention.' });
  }
  const visees: Visee[] = [
    { grandeur: 'puissanceVisee_w', valeur: visee_w },
    { grandeur: 'positionLateraleVisee_m', valeur: 0 },
  ];
  const manoeuvre: Volonte = {
    niveau: 'manoeuvre',
    but: tropLent ? 'accelerer' : 'entretenir',
    raisons,
    visees,
    cadre: [],
    echeance_s: t, // réévaluée à chaque pas
    declencheurs: [],
    impossibilite: plafonne && tropLent
      ? { code: 'cadre_puissance_atteint', explication: 'Je ne peux pas aller plus vite sans sortir de mon cadre de puissance.' }
      : null,
  };

  return {
    sortie: { etage: 'volontes', instant_s: t, objectif, intention, manoeuvre },
    memoire: { courantes: { etage: 'volontes', instant_s: t, objectif, intention, manoeuvre } },
    resume: `${objectif.but} > ${intention.but} > ${manoeuvre.but} (${visee_w.toFixed(0)} W)`,
    raisons,
  };
};
