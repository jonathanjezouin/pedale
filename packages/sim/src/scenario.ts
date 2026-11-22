import type { Archetype, Config, Profile, Rider, World } from './types';
import { mulberry32, range, shuffle } from './rng';
import { vitesseSolo } from './physics';
import { creerRoute } from './road';
import { clamp } from './util';
import { VELO_KG } from './calibration';

/** Les quatre archétypes du POC (§6.4), calibrés WorldTour (docs/v0.0.3-attributs.md). Valeurs de base, ensuite perturbées par la seed.
 *  `ftp` en W/kg sur le coureur seul : la puissance critique absolue en découle avec la masse tirée. */
const BASE: Record<Archetype, { ftp: number; wPrime: number; pPeak: number; tEnd: number; generosite: number; agressivite: number }> = {
  rouleur:      { ftp: 5.8, wPrime: 19000, pPeak: 1200, tEnd: 3000, generosite: 0.85, agressivite: 0.25 },
  sprinteur:    { ftp: 5.6, wPrime: 24000, pPeak: 1750, tEnd: 2800, generosite: 0.25, agressivite: 0.20 },
  attaquant:    { ftp: 5.7, wPrime: 27000, pPeak: 1350, tEnd: 2600, generosite: 0.50, agressivite: 0.90 },
  opportuniste: { ftp: 5.7, wPrime: 22000, pPeak: 1450, tEnd: 2700, generosite: 0.35, agressivite: 0.50 },
};
const ARCH: Archetype[] = ['rouleur', 'sprinteur', 'attaquant', 'opportuniste'];

export function configParDefaut(seed: number): Config {
  const r = mulberry32(seed ^ 0x5eed);
  return {
    seed,
    distance: Math.round(range(r, 16000, 24000) / 100) * 100,
    vent: Math.round(range(r, 2.5, 4.5) * 10) / 10,
    ventMode: 'fixe',
    ventDecalage: Math.round(range(r, -0.6, 0.6) * 100) / 100,
    route: 'courbes',
    nbCoureurs: 8,
    dt: 0.25,
    trace: 'changements',
  };
}

function creerProfil(arch: Archetype, r: () => number): Profile {
  const b = BASE[arch];
  const j = (v: number, pct: number) => v * (1 + (r() * 2 - 1) * pct);
  const mass = range(r, 70, 78);
  const p: Profile = {
    cp: j(b.ftp, 0.04) * (mass - VELO_KG), wPrime: j(b.wPrime, 0.08), pPeak: j(b.pPeak, 0.05), tEnd: j(b.tEnd, 0.10),
    mass, cda: range(r, 0.30, 0.34),
    generosite: clamp(b.generosite + (r() - 0.5) * 0.2, 0, 1),
    agressivite: clamp(b.agressivite + (r() - 0.5) * 0.2, 0, 1),
    experience: range(r, 0.3, 0.9),
    lateral: range(r, -0.3, 0.3),
    pointe: 0,
    objectif: 'gagner',
  };
  p.pointe = clamp((p.pPeak - 1100) / (1750 - 1100), 0, 1);
  return p;
}

export function creerMonde(partiel: Partial<Config> & { seed: number }): World {
  const cfg: Config = { ...configParDefaut(partiel.seed), ...partiel };
  const r = mulberry32(cfg.seed);
  // 2 coureurs de chaque archétype (8 par défaut), lettres mélangées
  const archs: Archetype[] = [];
  for (let i = 0; i < cfg.nbCoureurs; i++) archs.push(ARCH[i % ARCH.length]!);
  const ordreArch = shuffle(r, archs);
  const place = shuffle(r, ordreArch.map((_, i) => i));   // ordre initial dans la file
  const riders: Rider[] = ordreArch.map((arch, i) => {
    const profile = creerProfil(arch, r);
    return {
      id: i, letter: String.fromCharCode(65 + i), archetype: arch, profile,
      x: 0, y: 0, v: 0, p: 0,
      E: clamp(range(r, 0.62, 0.85) * (0.9 + 0.1 * (profile.tEnd / 2700)), 0.3, 1), X: range(r, 0.92, 1),
      intent: { kind: null, since: 0, commitUntil: 0, nextEval: 0, phase: '', phaseSince: 0, sprint: false, cible: null, vHold: 0, side: -1, forceEval: 'depart' },
      stats: {
        leadTime: 0, leadRecent: 0, relaisPris: 0, attaques: 0, lastAttackT: -1e9,
        tempsParIntention: { relais: 0, abriter: 0, rabattre: 0, attaquer: 0, suivre: 0, gerer: 0, revenir: 0 },
        maxLeadStreak: 0, leadStreak: 0, leadStreakStart: 0,
      },
      decroche: false, ecartDevant: 1e9, status: 'course', finishTime: null, cuit: false, last: null, draft: 0,
      hw: cfg.vent, cw: 0, posture: 0, postureT: 0, vy: 0, yTf: 0,
    };
  });
  const cpMoy = riders.reduce((s, q) => s + q.profile.cp, 0) / riders.length;
  const cdaMoy = riders.reduce((s, q) => s + q.profile.cda, 0) / riders.length;
  const massMoy = riders.reduce((s, q) => s + q.profile.mass, 0) / riders.length;
  // allure de départ : ~90 % de la puissance critique moyenne contre le vent de face (comparable d'un mode de vent à l'autre)
  const road = creerRoute(cfg.seed, -400, cfg.distance + 500, cfg.route === 'courbes');
  const phi = road.capMoyen(0, cfg.distance) + cfg.ventDecalage;
  const vent = { wx: -cfg.vent * Math.cos(phi), wy: -cfg.vent * Math.sin(phi) };
  const hwMoy = cfg.vent;
  const vInit = vitesseSolo(0.90 * cpMoy, cdaMoy, massMoy, hwMoy);
  // file indienne initiale : écart roue 0,6 m
  place.forEach((rang, k) => { const q = riders[k]!; q.x = -rang * 2.4; q.v = vInit; });
  return {
    t: 0, cfg, riders, finishX: cfg.distance,
    events: [], trace: [],
    meneurId: null, meneurDepuis: 0, meneurCandidat: null, meneurCandidatDepuis: 0, changementsDeTete: 0,
    attaque: null, sprintLance: false,
    vue: { ordre: [], vitesse: vInit, meneur: null, xMoyen: 0, xFront: 0, tanB: 0, yTete: 0, coteMontant: -1 },
    result: { statut: 'en cours', ordre: [], vainqueur: null, tFin: 0 },
    nextEventId: 0, vInit, road, vent,
  };
}
