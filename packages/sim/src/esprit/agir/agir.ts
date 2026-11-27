import type { Agir, GrandeurCadree, Volontes } from '../../contrats/index.ts';

const viseeDe = (v: Volontes, grandeur: GrandeurCadree, parDefaut: number): number =>
  v.manoeuvre.visees.find((x) => x.grandeur === grandeur)?.valeur ?? parDefaut;

/** Étage 4 : traduit la Manœuvre en Commandes. Ne décide rien de nouveau. */
export const agir: Agir = (volontes, _memoire) => {
  const puissanceVisee_w = viseeDe(volontes, 'puissanceVisee_w', 0);
  return {
    sortie: {
      etage: 'commandes',
      instant_s: volontes.instant_s,
      puissanceVisee_w,
      positionLateraleVisee_m: viseeDe(volontes, 'positionLateraleVisee_m', 0),
      freinage_ratio: 0,
    },
    memoire: { dernierInstant_s: volontes.instant_s },
    resume: `Je pédale à ${puissanceVisee_w.toFixed(0)} W.`,
    raisons: [{ code: 'traduction_manoeuvre', explication: 'Je traduis ma manœuvre en effort sur les pédales.' }],
  };
};
