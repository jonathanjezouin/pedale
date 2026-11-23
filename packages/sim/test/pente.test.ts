import { describe, expect, it } from 'vitest';
import { genererParcours } from '@pedale/parcours';
import {
  A_LAT, COMPOSITION_ETAPE, bruitAutres, bruitDe, capSoutenu, durabilitePct, FREINAGE_DESCENTE, PLANCHER, PROLONGEMENT_AVANT, REF_APTITUDES, ROAD_DS, TYPES_PHYSIQUES, USURE_ETAPE, USURE_FINALE, V_DROITE,
  aptitudes, consommer, creerMonde, creerRoute, creerRouteDepuisParcours, forcePenteRoulement, interpreter, pas, percevoir, resistance, simuler, typePhysique, vitesseSolo,
} from '../src/index';

const etape = (type: 'plate' | 'vallonnee' | 'montagne', km: number, seed = 5) => genererParcours({ seed, distance: km * 1000, type });
const mondeEtape = (type: 'plate' | 'vallonnee' | 'montagne', km = 60, seed = 5) => creerMonde({ seed, parcours: etape(type, km, seed) });

describe('v0.0.5 : la pente dans le bilan de forces', () => {
  it('la force de pente est le roulement à plat, positive en montée, négative en descente raide', () => {
    const m = 80;
    expect(forcePenteRoulement(0, m)).toBeCloseTo(0.004 * m * 9.81, 6);
    expect(forcePenteRoulement(0.07, m)).toBeGreaterThan(forcePenteRoulement(0.03, m));
    expect(forcePenteRoulement(0.07, m)).toBeCloseTo(m * 9.81 * (0.004 + 0.07) / Math.sqrt(1 + 0.07 ** 2) , 0);
    expect(forcePenteRoulement(-0.06, m)).toBeLessThan(0);          // la gravité pousse
    expect(forcePenteRoulement(-0.003, m)).toBeGreaterThan(-1);     // une très faible descente ne suffit pas à rouler
  });
  it('la même puissance donne une vitesse plus basse en montée et plus haute en descente', () => {
    const v = (g: number) => vitesseSolo(330, 0.32, 75, 0, g);
    expect(v(0.07)).toBeLessThan(v(0.03)); expect(v(0.03)).toBeLessThan(v(0)); expect(v(0)).toBeLessThan(v(-0.04));
    expect(v(0.07) * 3.6).toBeGreaterThan(12); expect(v(0.07) * 3.6).toBeLessThan(26);       // ordre de grandeur d'une côte à 7 % : 15-22 km/h
    expect(v(0) * 3.6).toBeGreaterThan(30);
  });
  it('un coureur « lit » sa pente dans la résistance : plus la pente est forte, plus il faut de puissance pour la même vitesse', () => {
    const w = mondeEtape('montagne', 40);
    const r = w.riders[0]!; r.hw = 0; r.cw = 0;
    r.pente = 0; const plat = resistance(5, 0, r);
    r.pente = 0.08; const cote = resistance(5, 0, r);
    r.pente = -0.08; const desc = resistance(5, 0, r);
    expect(cote).toBeGreaterThan(plat * 3); expect(desc).toBeLessThan(0);
  });
  it('l\'aspiration ne vaut presque rien en côte : à 6 km/h sur 8 %, elle économise moins de 4 % de la puissance ; à 36 km/h à plat, plus de 25 %', () => {
    const w = mondeEtape('montagne', 40);
    const r = w.riders[0]!; r.hw = 0; r.cw = 0;
    const gain = (v: number, g: number) => { r.pente = g; const sans = resistance(v, 0, r), avec = resistance(v, 0.4, r); return (sans - avec) / sans; };
    expect(gain(6 / 3.6, 0.08)).toBeLessThan(0.04);
    expect(gain(36 / 3.6, 0)).toBeGreaterThan(0.25);
    expect(gain(24 / 3.6, 0.05)).toBeLessThan(gain(36 / 3.6, 0));
  });
});

describe('v0.0.5 : la route porte le relief', () => {
  it('la route du POC est plate et sans limite de vitesse autre que la ligne droite', () => {
    const r = creerRoute(1, -400, 5000, true);
    expect(r.profilEtape).toBeNull();
    expect(r.alt(1000)).toBe(0); expect(r.pente(1000)).toBe(0); expect(r.vitesseMax(1000)).toBe(V_DROITE);
  });
  it('construite depuis un parcours : altitude, pente, prolongements avant et après', () => {
    const p = etape('montagne', 50);
    const r = creerRouteDepuisParcours(p);
    expect(r.profilEtape).toBe(p);
    expect(r.s0).toBe(-PROLONGEMENT_AVANT);
    for (const s of [0, 1000, 12_340, 33_000, p.distance]) { const i = Math.round(s / p.pas); expect(r.alt(s)).toBeCloseTo(p.alt[i]!, 0); }
    expect(r.alt(-300)).toBeCloseTo(p.alt[0]!, 6);                     // avant le départ : à plat
    expect(r.alt(p.distance + 400)).toBeCloseTo(p.alt[p.n - 1]!, 6);   // après l'arrivée aussi
    // la pente est la dérivée de l'altitude (± 20 m)
    for (const s of [5000, 18_000, 41_000]) expect(r.pente(s)).toBeCloseTo((r.alt(s + 20) - r.alt(s - 20)) / 40, 2);
    expect(r.n).toBe(Math.ceil((r.s1 - r.s0) / ROAD_DS) + 1);
  });
  it('la route suit le tracé du parcours (le point de départ et le cap)', () => {
    const p = etape('vallonnee', 40);
    const r = creerRouteDepuisParcours(p);
    expect(r.xy(0).x).toBeCloseTo(p.x[0]!, 3); expect(r.xy(p.distance).y).toBeCloseTo(p.y[p.n - 1]!, 0);
    expect(r.heading(0)).toBeCloseTo(p.cap[0]!, 3);
  });
  it('la vitesse maximale suit la courbure, ne dépasse jamais la ligne droite, et le freinage commence avant le virage', () => {
    const p = etape('montagne', 80);
    const r = creerRouteDepuisParcours(p);
    let serre = Infinity;
    for (let s = 0; s < p.distance; s += ROAD_DS) {
      const v = r.vitesseMax(s), suiv = r.vitesseMax(s + ROAD_DS);
      expect(v).toBeLessThanOrEqual(V_DROITE + 1e-9);
      expect(v).toBeLessThanOrEqual(Math.sqrt(suiv * suiv + 2 * FREINAGE_DESCENTE * ROAD_DS) + 1e-6);   // on peut toujours freiner à temps
      const k = Math.abs(r.courbure(s)); if (k > 1e-6) expect(v).toBeLessThanOrEqual(Math.sqrt(A_LAT / k) + 3);
      serre = Math.min(serre, v);
    }
    expect(serre).toBeLessThan(23);       // un lacet serré impose moins que la ligne droite (24 m/s), même après lissage de la courbure
    expect(serre).toBeGreaterThan(5);
  });
});

describe('v0.0.5 : départ d\'étape et régimes de fatigue', () => {
  it('une étape : réserves pleines, distance du parcours, composition avec des grimpeurs, durée maximale tirée du profil', () => {
    const w = mondeEtape('montagne', 100);
    expect(w.finishX).toBe(100_000);
    for (const r of w.riders) { expect(r.E).toBeGreaterThanOrEqual(0.97); expect(r.X).toBeGreaterThanOrEqual(0.97); expect(r.usure).toBe(USURE_ETAPE); }
    expect(w.riders.map((r) => r.archetype).sort()).toEqual([...COMPOSITION_ETAPE].sort());
    expect(w.riders.filter((r) => r.archetype === 'grimpeur')).toHaveLength(2);
    expect(w.tMax).toBeGreaterThan(100_000 / 5);
  });
  it('la fin d\'étape du POC est inchangée : réserves entamées, deux de chaque archétype, régime d\'usure d\'origine', () => {
    const w = creerMonde({ seed: 3 });
    expect(w.road.profilEtape).toBeNull();
    for (const r of w.riders) { expect(r.E).toBeLessThan(0.9); expect(r.usure).toBe(USURE_FINALE); expect(r.archetype).not.toBe('grimpeur'); }
    expect(w.cfg.distance).toBeLessThan(25_000);
  });
  it('5 h à 55 % du FTP ne coûtent presque rien à un coureur d\'étape (≈ 0,04) alors que l\'ancien régime viderait la réserve ; au plancher les deux régimes diffèrent de l\'échelle seule', () => {
    const cout = (regime: typeof USURE_ETAPE | typeof USURE_FINALE, effort: number, secondes: number) => {
      const r = creerMonde({ seed: 2 }).riders[0]!; r.usure = regime; r.E = 1; r.X = 1;
      for (let t = 0; t < secondes; t += 5) consommer(r, effort * r.profile.ftp, 5);
      return 1 - r.E;
    };
    const etape55 = cout(USURE_ETAPE, 0.55, 5 * 3600);
    expect(etape55).toBeGreaterThan(0.02); expect(etape55).toBeLessThan(0.1);
    expect(cout(USURE_FINALE, 0.55, 5 * 3600)).toBeGreaterThan(0.9);                    // l'ancien régime viderait tout
    // au plancher et au-dessus : seule l'échelle change
    expect(cout(USURE_FINALE, PLANCHER, 600)).toBeCloseTo(cout(USURE_ETAPE, PLANCHER, 600) * USURE_ETAPE.echelle, 2);
  });
});

describe('v0.0.5 : perception et interprétation de la pente', () => {
  it('le coureur ressent sa pente, voit les 400 m devant, connaît le profil du reste de l\'étape', () => {
    const w = mondeEtape('montagne', 60);
    for (let i = 0; i < 4 * 120; i++) pas(w);
    const r = w.vue.ordre[0]!;
    const { percu } = percevoir(w, r);
    expect(percu.course.pente).toBeCloseTo(r.pente * 100, 6);
    expect(percu.course.penteDevant).toBeCloseTo(((w.road.alt(r.x + 400) - w.road.alt(r.x)) / 400) * 100, 6);
    expect(percu.course.profil).not.toBeNull();
    expect(percu.course.profil!.distance).toBeCloseTo(w.finishX - Math.floor(r.x / 1000) * 1000, -1);
    expect(percevoir(creerMonde({ seed: 1 }), creerMonde({ seed: 1 }).riders[0]!).percu.course.profil).toBeNull();
  });
  it('terrain : montée, plat, descente ; une montée qui compte annoncée devant ; budget fini', () => {
    const w = mondeEtape('montagne', 80);
    const terrains = new Set<string>(); let col = false, budgetMin = 1;
    for (let i = 0; w.result.statut !== 'termine' && w.t < 30000; i++) {
      pas(w);
      if (i % 12 === 0) for (const r of w.vue.ordre) {
        const d = r.last; if (!d) continue;
        terrains.add(d.interprete.terrain); if (d.interprete.colDevant || d.interprete.colEnCours) col = true; budgetMin = Math.min(budgetMin, d.interprete.budget);
      }
    }
    expect([...terrains].sort()).toEqual(['descente', 'montee', 'plat']);
    expect(col).toBe(true);
    expect(budgetMin).toBeLessThan(0.9); expect(Number.isFinite(budgetMin)).toBe(true);
  }, 120000);
  it('hors étape rien ne change : pas de profil, budget 1, terrain plat', () => {
    const w = creerMonde({ seed: 4 });
    for (let i = 0; i < 40; i++) pas(w);
    const d = w.riders[0]!.last!;
    expect(d.interprete.budget).toBe(1); expect(d.interprete.colDevant).toBeNull(); expect(d.interprete.terrain).toBe('plat');
    const { percu } = percevoir(w, w.riders[0]!);
    expect(interpreter(w.riders[0]!, percu).colEnCours).toBeNull();
  });
});

describe('v0.0.5 : aptitudes par terrain et types physiques', () => {
  const lots = (n: number) => {
    const t: Record<string, Record<string, number>> = {}; const tot: Record<string, number> = {};
    for (let s = 1; s <= n; s++) for (const r of creerMonde({ seed: s, parcours: etape('plate', 40, 1) }).riders) {
      const k = typePhysique(r.profile); ((t[r.archetype] ??= {})[k] = (t[r.archetype]![k] ?? 0) + 1); tot[r.archetype] = (tot[r.archetype] ?? 0) + 1;
    }
    return (a: string, k: string) => (t[a]?.[k] ?? 0) / tot[a]!;
  };
  it('les quatre aptitudes se calculent depuis les attributs et le gabarit (jamais stockées)', () => {
    const r = creerMonde({ seed: 2 }).riders[0]!;
    const a = aptitudes(r.profile);
    expect(a.montagne).toBeCloseTo(r.profile.ftp / (r.profile.mass - 7), 6);
    expect(a.plat).toBeCloseTo(r.profile.ftp / r.profile.cda, 6);
    expect(a.punch).toBeCloseTo(r.profile.wPrime / (r.profile.mass - 7), 6);
    expect(a.sprint).toBeCloseTo(r.profile.pPeak / (r.profile.mass - 7), 6);
    expect(Object.keys(REF_APTITUDES).sort()).toEqual(['montagne', 'plat', 'punch', 'sprint']);
    expect(TYPES_PHYSIQUES).toEqual(['grimpeur', 'rouleur', 'puncheur', 'sprinteur']);
  });
  it('les types calculés correspondent aux générateurs : grimpeur, sprinteur, attaquant → puncheur, rouleur', () => {
    const f = lots(80);
    expect(f('grimpeur', 'grimpeur')).toBeGreaterThan(0.85);
    expect(f('sprinteur', 'sprinteur')).toBeGreaterThan(0.85);
    expect(f('attaquant', 'puncheur')).toBeGreaterThan(0.7);
    expect(f('rouleur', 'rouleur')).toBeGreaterThan(0.55);
  });
  it('le grimpeur est plus léger et plus fort au kilo que le rouleur, qui est plus fort en absolu à plat', () => {
    const moy = (arch: string, f: (r: ReturnType<typeof creerMonde>['riders'][0]) => number) => { const v: number[] = []; for (let s = 1; s <= 30; s++) for (const r of creerMonde({ seed: s, parcours: etape('plate', 40, 1) }).riders) if (r.archetype === arch) v.push(f(r)); return v.reduce((a, b) => a + b, 0) / v.length; };
    expect(moy('grimpeur', (r) => r.profile.mass)).toBeLessThan(moy('rouleur', (r) => r.profile.mass) - 8);
    expect(moy('grimpeur', (r) => aptitudes(r.profile).montagne)).toBeGreaterThan(moy('rouleur', (r) => aptitudes(r.profile).montagne) + 0.3);
    expect(moy('rouleur', (r) => r.profile.ftp)).toBeGreaterThan(moy('grimpeur', (r) => r.profile.ftp) + 30);
  });
});

describe('v0.0.5 : une étape se court, la pente fait le reste', () => {
  const courir = (type: 'plate' | 'vallonnee' | 'montagne', km: number, seed: number) => simuler(mondeEtape(type, km, seed));
  it('les trois types d\'étape se terminent sans neutralisation, à une allure plausible', () => {
    const vit = (w: ReturnType<typeof courir>) => (w.finishX / 1000) / (w.result.tFin / 3600);
    const plate = courir('plate', 60, 11), vall = courir('vallonnee', 60, 11), mont = courir('montagne', 60, 11);
    for (const w of [plate, vall, mont]) { expect(w.result.statut).toBe('termine'); expect(w.result.neutralisee).toBe(false); expect(w.result.ordre).toHaveLength(8); }
    expect(vit(plate)).toBeGreaterThan(28); expect(vit(plate)).toBeLessThan(42);
    expect(vit(mont)).toBeGreaterThan(17); expect(vit(mont)).toBeLessThan(36);
    expect(vit(mont)).toBeLessThan(vit(plate));                       // la montagne est plus lente que la plaine
  }, 120000);
  it('en descente la vitesse est limitée par la route : jamais au-delà de la limite, mais on descend vite', () => {
    const w = mondeEtape('montagne', 60, 3);
    let depasse = 0, vMax = 0;
    while (w.result.statut !== 'termine' && w.t < 20000) {
      pas(w);
      for (const r of w.vue.ordre) { const lim = w.road.vitesseMax(r.x); if (r.v > lim + 0.35) depasse++; if (r.pente < -0.04) vMax = Math.max(vMax, r.v); }
    }
    expect(depasse).toBe(0);
    expect(vMax * 3.6).toBeGreaterThan(50);                             // les descentes se font à plus de 50 km/h
  }, 120000);
  it('les groupes se désagrègent par la pente : l\'écart d\'arrivée moyen est plus grand en montagne qu\'en plaine', () => {
    const med = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const ecarts = (type: 'plate' | 'montagne') => Array.from({ length: 16 }, (_, k) => {
      const t = courir(type, 100, 21 + k).riders.map((r) => r.finishTime!).sort((a, b) => a - b); return t[t.length - 1]! - t[0]!;
    });
    expect(med(ecarts('montagne'))).toBeGreaterThan(1.5 * med(ecarts('plate')));      // lot de 30 étapes de 100 km : 8,0 min contre 2,3 min en moyenne
  }, 240000);
  it('l\'abri vaut moins en côte qu\'à plat, en watts économisés', () => {
    const w = mondeEtape('montagne', 60, 4);
    const cote: number[] = [], plat: number[] = [];
    while (w.result.statut !== 'termine' && w.t < 20000) {
      pas(w);
      if (w.t > 300 && Math.abs(w.t % 10) < 0.13) for (const r of w.vue.ordre) {
        if (r.draft < 0.05) continue;
        const sans = resistance(r.v, 0, r), avec = resistance(r.v, r.draft, r), g = sans > 0 ? (sans - avec) / sans : 0;
        if (r.pente > 0.05) cote.push(g); else if (Math.abs(r.pente) < 0.01) plat.push(g);
      }
    }
    const moy = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(cote.length).toBeGreaterThan(20); expect(plat.length).toBeGreaterThan(20);
    expect(moy(cote)).toBeLessThan(0.6 * moy(plat));
  }, 120000);
  it('les grimpeurs gagnent plus souvent en montagne qu\'à plat (et que le hasard : 2 sur 8)', () => {
    const taux = (type: 'plate' | 'montagne') => { let g = 0; const n = 40; for (let k = 0; k < n; k++) { const w = courir(type, 100, 40 + k); if (w.riders[w.result.ordre[0]!]!.archetype === 'grimpeur') g++; } return g / n; };
    expect(taux('montagne')).toBeGreaterThan(taux('plate'));       // validation v0.1.0 : 17 % (plate) contre 46 % (montagne) sur 1 000 étapes
  }, 900000);
});

describe('v0.0.6 : le vent d\'une étape ne dépend pas du cap moyen du tracé', () => {
  const dir = (w: ReturnType<typeof creerMonde>) => Math.atan2(w.vent.wy, w.vent.wx);
  it('la direction se tire dans la seed : mêmes seeds, même vent ; seeds différentes, directions variées', () => {
    expect(dir(mondeEtape('plate', 30, 11))).toBeCloseTo(dir(mondeEtape('plate', 30, 11)), 9);
    const angles = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => dir(mondeEtape('vallonnee', 30, s)));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(Math.PI);     // pas toutes proches d'une même direction
  });
  it('la force du vent reste celle de la config ; le vent n\'est plus de face en moyenne sur tout le tracé', () => {
    const w = mondeEtape('montagne', 60, 3);
    expect(Math.hypot(w.vent.wx, w.vent.wy)).toBeCloseTo(w.cfg.vent, 6);
    const hw = (s: number) => -(w.vent.wx * Math.cos(w.road.heading(s)) + w.vent.wy * Math.sin(w.road.heading(s)));
    let min = Infinity, max = -Infinity;
    for (let s = 0; s < w.finishX; s += 200) { min = Math.min(min, hw(s)); max = Math.max(max, hw(s)); }
    expect(max - min).toBeGreaterThan(0.5);     // le tracé tourne : l'exposition varie
  });
  it('la course du POC garde son vent (cap moyen + décalage)', () => {
    const w = creerMonde({ seed: 20260 });
    const phi = w.road.capMoyen(0, w.cfg.distance) + w.cfg.ventDecalage;
    expect(dir(w)).toBeCloseTo(Math.atan2(-Math.sin(phi), -Math.cos(phi)), 6);
  });
});

describe('v0.0.7 : fatigue aiguë, durabilité, sens de la course et sang-froid', () => {
  const mk = () => mondeEtape('plate', 30, 9).riders[0]!;
  it('la fatigue aiguë monte au-dessus du plancher, redescend en dessous, et reste bornée', () => {
    const r = mk(); expect(r.aigue).toBe(0);
    for (let i = 0; i < 60; i++) consommer(r, 1.05 * r.profile.ftp, 1);
    const haut = r.aigue; expect(haut).toBeGreaterThan(0.3); expect(haut).toBeLessThanOrEqual(1);
    for (let i = 0; i < 600; i++) consommer(r, 0.6 * r.profile.ftp, 1);
    expect(r.aigue).toBeLessThan(haut * 0.5);
    for (let i = 0; i < 3000; i++) consommer(r, 1.2 * r.profile.ftp, 1);
    expect(r.aigue).toBe(1);
  });
  it('rester au plancher ne charge pas les jambes', () => {
    const r = mk(); for (let i = 0; i < 600; i++) consommer(r, PLANCHER * r.profile.ftp, 1);
    expect(r.aigue).toBeLessThan(0.01);
  });
  it('la fatigue aiguë et l\'usure baissent un peu la capacité soutenue, seulement en étape pour l\'usure', () => {
    const r = mk(); const c0 = capSoutenu(r);
    r.aigue = 1; expect(capSoutenu(r)).toBeLessThan(c0); expect(capSoutenu(r)).toBeGreaterThan(0.9 * c0);
    r.aigue = 0; r.E = 0.5; const etape = capSoutenu(r);
    r.usure = USURE_FINALE; r.E = 0.5; expect(capSoutenu(r)).toBeGreaterThan(etape);
  });
  it('un tour de relais finit : en tête à l\'allure du groupe, on cède la place quand les jambes chargent, et on y revient reposé', () => {
    let tours = 0, longs = 0;
    for (const s of [3, 4, 5]) {
      const w = creerMonde({ seed: s, parcours: genererParcours({ seed: s, distance: 40000, type: 'plate' }) });
      simuler(w);
      for (const r of w.riders) { tours += r.stats.relaisPris; if (r.stats.maxLeadStreak > 1500) longs++; }
    }
    expect(tours).toBeGreaterThan(30);   // ça tourne
    expect(longs).toBeLessThan(6);       // personne ne mène éternellement
  }, 120000);
  it('la durabilité lue est une mesure du modèle : croissante avec tEnd', () => {
    expect(durabilitePct(3500)).toBeGreaterThan(durabilitePct(2500));
  });
  it('sens de la course et sang-froid : bornés, propres à chaque coureur, et le sang-froid garde le bruit sous la pression', () => {
    const w = mondeEtape('plate', 30, 2);
    for (const r of w.riders) { expect(r.profile.sens).toBeGreaterThanOrEqual(0.3); expect(r.profile.sens).toBeLessThanOrEqual(1); expect(r.profile.sangFroid).toBeGreaterThanOrEqual(0.3); expect(r.profile.sangFroid).toBeLessThanOrEqual(0.9); }
    expect(new Set(w.riders.map((r) => r.profile.sens.toFixed(4))).size).toBeGreaterThan(4);
    const r = w.riders[0]!; r.E = 0.2; r.decroche = true;
    r.profile.sangFroid = 0.9; const calme = bruitDe(r), calmeA = bruitAutres(r);
    r.profile.sangFroid = 0.3; expect(bruitDe(r)).toBeGreaterThan(calme); expect(bruitAutres(r)).toBeGreaterThan(calmeA);
  });
  it('un meilleur sens de la course donne une lecture moins bruitée des autres, sans changer le bruit sur soi', () => {
    const r = mk(); r.profile.sens = 0.9; const bon = bruitAutres(r), soi = bruitDe(r);
    r.profile.sens = 0.3; expect(bruitAutres(r)).toBeGreaterThan(bon); expect(bruitDe(r)).toBe(soi);
  });
});

describe('v0.1.0 : plus d\'immobilisation sur une rampe', () => {
  it('l\'étape de montagne de 227 km (seed 1056) où huit coureurs restaient arrêtés à 14 % se termine', () => {
    // avant la correction (P/v plancher à 2 m/s) : arrêt à 157 km, neutralisée après 18,9 h
    const w = creerMonde({ seed: 1056, parcours: genererParcours({ seed: 1056, distance: 227000, type: 'montagne' }) });
    simuler(w);
    expect(w.result.neutralisee).toBeFalsy();
    expect(w.result.tFin / 3600).toBeLessThan(12);
    expect(w.riders.every((r) => r.finishTime !== null)).toBe(true);
  }, 240000);
});

describe('v0.1.1 : un suiveur colle à la roue qu\'il suit', () => {
  it('l\'anticipation de l\'accélération de la roue est estimée et reste bornée', () => {
    const w = creerMonde({ seed: 3 });
    let aMax = 0, aMin = 0;
    for (let i = 0; i < 1200; i++) { pas(w); for (const r of w.riders) { aMax = Math.max(aMax, r.geste.aRoue); aMin = Math.min(aMin, r.geste.aRoue); } }
    expect(aMax).toBeGreaterThan(0.05);      // quelqu'un voit bien une roue accélérer
    expect(aMax).toBeLessThan(4); expect(aMin).toBeGreaterThan(-4);
  }, 60000);
  it('les écarts à la roue suivie : médiane sous 1 m, et moins de 19 % du temps au-delà de 3,5 m (20,4 % avant la v0.1.1)', () => {
    const gaps: number[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1500) {
        pas(w);
        for (const r of w.riders) {
          const id = r.geste.roueId; if (id === null || r.status !== 'course' || r.intent.kind !== 'abriter') continue;
          const o = w.riders[id]!, gap = o.x - r.x - 1.8;      // RIDER_LEN
          if (gap >= 0 && gap <= 30 && Math.abs(o.y - r.y) <= 2) gaps.push(gap);
        }
      }
    }
    gaps.sort((a, b) => a - b);
    expect(gaps.length).toBeGreaterThan(20000);
    expect(gaps[Math.floor(gaps.length / 2)]!).toBeLessThan(1);
    expect(gaps.filter((g) => g > 3.5).length / gaps.length).toBeLessThan(0.19);
  }, 120000);
});
