import { describe, expect, it } from 'vitest';
import { creerMonde, pas, simuler, expliquer, aspiration, aspirationValeur, ASPIRATION, puissanceVers, wattsPour, capSoutenu, E_CUIT, INTENTIONS, creerRoute, ROAD_HALF, niveauDe, durabilitePct, ftpWkg, lecture, palierDe, PALIERS, pointeNorm } from '../src/index';

describe('simulation v0.0.1', () => {
  it('est déterministe : même seed, même course', () => {
    const a = simuler(creerMonde({ seed: 42 })), b = simuler(creerMonde({ seed: 42 }));
    expect(a.events.map((e) => `${e.t}|${e.texte}`)).toEqual(b.events.map((e) => `${e.t}|${e.texte}`));
    expect(a.result).toEqual(b.result);
    const c = simuler(creerMonde({ seed: 43 }));
    expect(c.events.map((e) => e.texte)).not.toEqual(a.events.map((e) => e.texte));
  });

  it("l'aspiration réduit la puissance nécessaire", () => {
    const w = creerMonde({ seed: 1 });
    const [a, b] = w.riders;
    a!.x = 10; a!.y = 0; b!.x = 7.6; b!.y = 0;              // b est à 0,6 m derrière la roue de a
    const dr = aspiration(b!, w.riders);
    expect(dr).toBeGreaterThan(0.25);
    b!.draft = dr;
    const abrite = puissanceVers(10, 10, b!, w.cfg.vent);
    b!.draft = 0;
    const expose = puissanceVers(10, 10, b!, w.cfg.vent);
    expect(abrite).toBeLessThan(expose * 0.8);
  });

  it('les veto sont respectés : un coureur sans réserve ne peut ni relayer, ni attaquer, ni suivre', () => {
    const w = creerMonde({ seed: 7 });
    for (let i = 0; i < 40; i++) pas(w);
    const r = w.riders[0]!;
    r.E = E_CUIT - 0.05;
    for (let i = 0; i < 8; i++) pas(w);
    const d = r.last!;
    for (const k of ['relais', 'attaquer', 'suivre'] as const) {
      const ev = d.evaluations.find((e) => e.intention === k)!;
      expect(ev.vetos.length).toBeGreaterThan(0);
    }
    expect(['relais', 'attaquer', 'suivre']).not.toContain(r.intent.kind);
  });

  it('chaque décision est explicable : raisons nommées, perçu/réel, action', () => {
    const w = simuler(creerMonde({ seed: 3, trace: 'changements' }));
    expect(w.trace.length).toBeGreaterThan(50);
    for (const d of w.trace.slice(0, 500)) {
      expect(INTENTIONS).toContain(d.intention);
      expect(d.evaluations).toHaveLength(7);
      expect(d.action.length).toBeGreaterThan(3);
      const ev = d.evaluations.find((e) => e.intention === d.intention)!;
      // l'intention choisie n'est jamais frappée d'un veto (sauf repli explicite)
      expect(ev.vetos.length === 0 || d.intention === 'gerer').toBe(true);
      const txt = expliquer(d);
      expect(txt).toContain('Perçu');
      expect(txt).toContain('Intention');
      expect(txt).toContain('Action');
    }
  });

  it('des rotations de relais apparaissent sans avoir été écrites', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = simuler(creerMonde({ seed }));
      const meneurs = w.riders.filter((r) => r.stats.relaisPris > 0).length;
      expect(meneurs).toBeGreaterThanOrEqual(5);
      expect(w.changementsDeTete).toBeGreaterThan(15);
    }
  });

  it("la course se termine toujours et le résultat est cohérent", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = simuler(creerMonde({ seed }));
      expect(w.result.statut).toBe('termine');
      expect(w.result.ordre).toHaveLength(8);
      expect(new Set(w.result.ordre).size).toBe(8);
      expect(w.result.vainqueur).toBe(w.result.ordre[0]);
    }
  });

  it('la route est lisse (rayon ≥ 450 m) et le repère latéral est perpendiculaire à la route', () => {
    const road = creerRoute(5, -400, 20000, true);
    let kmax = 0;
    for (let s = -400; s < 20000; s += 10) kmax = Math.max(kmax, Math.abs(road.courbure(s)));
    expect(kmax).toBeLessThanOrEqual(1 / 450 + 1e-9);
    expect(kmax).toBeGreaterThan(1 / 3000);          // elle tourne bien
    const a = road.toXY(1000, 0), b = road.toXY(1000, 3), h = road.heading(1000);
    expect((b.x - a.x) * Math.cos(h) + (b.y - a.y) * Math.sin(h)).toBeCloseTo(0, 9);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(3, 9);
    const droite = creerRoute(5, -400, 20000, false);
    expect(Math.abs(droite.courbure(5000))).toBe(0);
    expect(ROAD_HALF).toBe(4);
  });

  it("vent de côté : le sillage dérive, il faut se décaler pour s'abriter (éventail)", () => {
    const w = creerMonde({ seed: 1, ventMode: 'face' });
    const [a, b] = w.riders;
    a!.x = 20; a!.y = 0; b!.x = 17.6; b!.status = 'course'; a!.status = 'course';
    for (const r of [a!, b!]) { r.v = 10; r.hw = 0; r.cw = 3; }       // vent pur de côté, pousse vers la droite (d > 0)
    b!.y = 0;
    const toutDroit = aspiration(b!, w.riders);
    b!.y = 0.6 * (3 / 10);                                              // décalé sous le vent d'environ gap·tanβ
    const decale = aspiration(b!, w.riders);
    expect(decale).toBeGreaterThan(toutDroit + 0.03);
    for (const r of [a!, b!]) { r.cw = 0; r.hw = 3; }
    b!.y = 0;
    expect(aspiration(b!, w.riders)).toBeGreaterThan(0.3);              // de face : derrière la roue, comme avant
  });

  it('vent fixe : l\'angle relatif change quand la route tourne ; vent « de face » : jamais de vent de côté', () => {
    const fixe = creerMonde({ seed: 11, ventMode: 'fixe', route: 'courbes' });
    const cw = new Set<number>();
    for (let s = 0; s < 20000; s += 500) { fixe.riders[0]!.x = s; pas(fixe); cw.add(Math.round(fixe.riders[0]!.cw * 10)); }
    expect(cw.size).toBeGreaterThan(4);
    const face = creerMonde({ seed: 11, ventMode: 'face', route: 'courbes' });
    for (let i = 0; i < 40; i++) pas(face);
    for (const r of face.riders) { expect(r.cw).toBe(0); expect(r.hw).toBeCloseTo(face.cfg.vent, 9); }
  });

  it('les décalages latéraux varient d\'un coureur à l\'autre (pas de constante unique) et on reste sur la route', () => {
    const w = creerMonde({ seed: 9 });
    const ys = new Set<number>();
    for (let t = 0; t < 1200 && w.result.statut !== 'termine'; t += 0.25) {
      pas(w);
      if (Math.round(t * 4) % 160 === 0) for (const r of w.riders) { ys.add(Math.round(r.y * 10)); expect(Math.abs(r.y)).toBeLessThanOrEqual(ROAD_HALF); }
    }
    expect(ys.size).toBeGreaterThan(8);
  });
});

describe('calibration WorldTour (v0.0.3)', () => {
  it('les niveaux suivent les ancrages, y compris pour une échelle inversée', () => {
    expect(niveauDe('ftp', 4.6)).toBe(0);
    expect(niveauDe('ftp', 5.0)).toBe(1);
    expect(niveauDe('ftp', 5.9)).toBe(2);
    expect(niveauDe('ftp', 6.4)).toBe(3);
    expect(niveauDe('ftp', 7)).toBe(4);
  });
  it('la durabilité lisible est croissante avec tEnd et bornée', () => {
    expect(durabilitePct(2600)).toBeCloseTo(94, 5);
    expect(durabilitePct(3200)).toBeGreaterThan(durabilitePct(2800));
    expect(durabilitePct(100)).toBe(90);
    expect(durabilitePct(9000)).toBeLessThanOrEqual(99.5);
  });
  it('les coureurs générés sont de niveau WorldTour : FTP entre 5 et 6,7 W/kg (poids du coureur sans le vélo)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const r of creerMonde({ seed }).riders) {
        const w = ftpWkg(r.profile);
        expect(w).toBeGreaterThan(5.0);
        expect(w).toBeLessThan(6.7);
        const l = lecture(r.profile);
        expect(l.niveaux.ftp).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('v0.0.3a : aspiration en cloche et cumul multiplicatif', () => {
  it('la cloche a un sommet plat, décroît avec le décalage et avec l\'écart', () => {
    const v = (e: number, dy: number) => aspirationValeur(e, dy);
    expect(v(0.6, 0)).toBeGreaterThan(0.3);
    expect(v(0.6, 0.15)).toBeGreaterThan(0.9 * v(0.6, 0));        // petit décalage : coût faible (sommet plat)
    expect(v(0.6, 0.5)).toBeLessThan(0.6 * v(0.6, 0));            // demi-largeur d'épaule : on a perdu une bonne part
    expect(v(0.6, 1.2)).toBe(0);                                  // hors sillage
    expect(v(1, 0)).toBeGreaterThan(v(3, 0));
    expect(v(ASPIRATION.portee + 1, 0)).toBe(0);
    for (let dy = 0; dy < 1.2; dy += 0.1) expect(v(1, dy + 0.1)).toBeLessThanOrEqual(v(1, dy) + 1e-12);   // jamais croissante
  });
  it('le cumul de deux sillages est multiplicatif : plus que le meilleur, moins que la somme, plafonné', () => {
    const w = creerMonde({ seed: 1 });
    const [a, b, c] = w.riders;
    for (const r of [a!, b!, c!]) { r.status = 'course'; r.y = 0; r.cw = 0; r.hw = 3; }
    c!.x = 0; b!.x = 4; a!.x = 8;                                 // c suit b (écart 2,2 m) qui suit a
    const seul = aspiration(c!, [b!]);
    const deux = aspiration(c!, [a!, b!]);
    const dB = aspirationValeur(4 - 1.8, 0), dA = aspirationValeur(8 - 1.8, 0);
    expect(deux).toBeGreaterThan(seul);
    expect(deux).toBeCloseTo(Math.min(ASPIRATION.plafond, 1 - (1 - dB) * (1 - dA)), 9);
    expect(deux).toBeLessThan(dB + dA);
    expect(deux).toBeLessThanOrEqual(ASPIRATION.plafond);
  });
});

describe('v0.0.3a : FTP, paliers, contrat Vouloir → Agir', () => {
  it('FTP est le seul nom du seuil ; plus de générosité dans le profil', () => {
    const p = creerMonde({ seed: 1 }).riders[0]!.profile as unknown as Record<string, unknown>;
    expect(typeof p.ftp).toBe('number');
    expect(p.cp).toBeUndefined();
    expect(p.generosite).toBeUndefined();
  });
  it('les 7 paliers couvrent tout l\'effort, la frontière Z4 / Z5 est à 100 % du FTP', () => {
    expect(PALIERS).toHaveLength(7);
    expect(palierDe(0.3).code).toBe('Z1');
    expect(palierDe(0.6).code).toBe('Z2');
    expect(palierDe(0.8).code).toBe('Z3');
    expect(palierDe(0.95).code).toBe('Z4');
    expect(palierDe(1.0).code).toBe('Z4');
    expect(palierDe(1.05).code).toBe('Z5');
    expect(palierDe(1.3).code).toBe('Z6');
    expect(palierDe(2.5).code).toBe('Z7');
  });
  it('la conversion effort → watts est bornée par la physique (réserve sous le FTP, explosivité au-dessus)', () => {
    const r = creerMonde({ seed: 2 }).riders[0]!;
    r.E = 1; r.X = 1;
    expect(wattsPour(r, 0.8)).toBeCloseTo(0.8 * r.profile.ftp, 6);
    expect(wattsPour(r, 1.2)).toBeCloseTo(1.2 * r.profile.ftp, 6);
    expect(wattsPour(r, 5)).toBeLessThan(5 * r.profile.ftp);             // la pointe plafonne
    r.E = 0.1;
    expect(wattsPour(r, 1)).toBeCloseTo(capSoutenu(r), 6);              // fatigué : on ne tient plus le FTP
    r.E = 1; r.X = 0;
    expect(wattsPour(r, 1.5)).toBeLessThanOrEqual(capSoutenu(r) + 1e-6); // plus d'explosivité : pas au-dessus
  });
  it('chaque décision porte un effort visé (ou null), un effort max et une fatigue max cohérents', () => {
    const w = simuler(creerMonde({ seed: 4, trace: 'changements' }));
    expect(w.trace.length).toBeGreaterThan(50);
    for (const r of w.riders) {
      const it = r.intent;
      expect(it.effortMax).toBeGreaterThan(0);
      expect(it.fatigueMax).toBeGreaterThan(0);
      expect(it.fatigueMax).toBeLessThanOrEqual(1);
      if (it.effort !== null) expect(it.effort).toBeLessThanOrEqual(it.effortMax + 1e-9);
    }
  });
  it('Agir ne modifie jamais l\'intention : seule la décision (Vouloir) la change', () => {
    const w = creerMonde({ seed: 6 });
    for (let i = 0; i < 4; i++) pas(w);
    let changementsHorsDecision = 0;
    while (w.result.statut !== 'termine' && w.t < 900) {
      const avant = w.riders.map((r) => `${r.intent.kind}|${r.intent.effort}|${r.intent.effortMax}|${r.intent.sprint}|${r.intent.cible}`);
      const decisions = w.riders.map((r) => r.last?.t);
      // une décision a lieu au début du pas ; on ne peut comparer qu'à travers elle : si `last` n'a pas bougé, l'intention n'a pas bougé
      pas(w);
      w.riders.forEach((r, i) => {
        const apres = `${r.intent.kind}|${r.intent.effort}|${r.intent.effortMax}|${r.intent.sprint}|${r.intent.cible}`;
        if (apres !== avant[i] && r.last?.t === decisions[i]) changementsHorsDecision++;
      });
    }
    expect(changementsHorsDecision).toBe(0);
  });
  it('Agir déclare des événements, ils couvrent limite-atteinte, fin-burst, rejoint, passage-termine', () => {
    const vus = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1800) {
        pas(w);
        for (const r of w.riders) for (const e of r.evenements) vus.add(e.type);
      }
    }
    expect(vus.has('limite-atteinte')).toBe(true);
    expect(vus.has('fin-burst')).toBe(true);
    expect(vus.has('rejoint')).toBe(true);
    expect(vus.has('passage-termine')).toBe(true);
  });
});

describe('v0.0.3a : groupes (vue dérivée)', () => {
  it('les groupes partitionnent les coureurs en course, de la tête vers l\'arrière, sans « décroché » à l\'intérieur', () => {
    const w = creerMonde({ seed: 8 });
    for (let t = 0; t < 600; t += 1) {
      for (let i = 0; i < 4; i++) pas(w);
      const g = w.vue.groupes;
      expect(g.flat().map((r) => r.id).sort()).toEqual(w.vue.ordre.map((r) => r.id).sort());
      g.forEach((gr) => gr.forEach((r, i) => { if (i > 0) expect(r.decroche).toBe(false); }));
      g.forEach((gr, k) => { if (k > 0) expect(gr[0]!.decroche).toBe(true); });
      if (w.result.statut === 'termine') break;
    }
  });
  it('un coureur perçoit la taille de son groupe', () => {
    const w = creerMonde({ seed: 8 });
    for (let i = 0; i < 12; i++) pas(w);
    const r = w.riders[0]!;
    expect(r.last!.percu.moi.groupeTaille).toBeGreaterThanOrEqual(1);
  });
});

describe('v0.0.3a : pointe normalisée par une constante nommée', () => {
  it('pointeNorm borne à 0..1 sur la plage du POC', () => {
    expect(pointeNorm(1100)).toBe(0);
    expect(pointeNorm(1750)).toBe(1);
    expect(pointeNorm(5000)).toBe(1);
    expect(pointeNorm(1425)).toBeCloseTo(0.5, 6);
  });
});
