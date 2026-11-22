import { describe, expect, it } from 'vitest';
import { creerMonde, pas, simuler, dureeMax, dangerSuppose, dispositionDe, PLACE_LABEL, INTENTION_LABEL, expliquer, aspiration, aspirationValeur, ASPIRATION, puissanceVers, wattsPour, capSoutenu, E_CUIT, INTENTIONS, creerRoute, ROAD_HALF, niveauDe, durabilitePct, ftpWkg, lecture, palierDe, PALIERS, pointeNorm } from '../src/index';
import { executionDe } from '../src/scenario';
import { porteOuverte } from '../src/action';
import { PLANCHER, vitesseSolo, capf, axeY, enLigne } from '../src/index';

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

  it('les veto sont respectés : un coureur sans réserve ne peut ni participer, ni se placer, ni attaquer, ni suivre', () => {
    const w = creerMonde({ seed: 7 });
    for (let i = 0; i < 40; i++) pas(w);
    const r = w.riders[0]!;
    r.E = Math.min(r.E, E_CUIT) - 0.1;       // très en dessous du seuil : la perception est approximative (bruit), le veto porte sur ce qu'il ressent
    r.E = Math.max(0, r.E);
    for (let i = 0; i < 8; i++) pas(w);
    const d = r.last!;
    for (const k of ['participer', 'placer', 'attaquer', 'suivre'] as const) {
      const ev = d.evaluations.find((e) => e.intention === k)!;
      expect(ev.vetos.length).toBeGreaterThan(0);
    }
    expect(['participer', 'placer', 'attaquer', 'suivre']).not.toContain(r.intent.kind);
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
      const avant = w.riders.map((r) => `${r.intent.kind}|${r.intent.effort}|${r.intent.effortMax}|${r.intent.sprint}|${r.intent.cible}|${r.intent.place}`);
      const decisions = w.riders.map((r) => r.last?.t);
      // une décision a lieu au début du pas ; on ne peut comparer qu'à travers elle : si `last` n'a pas bougé, l'intention n'a pas bougé
      pas(w);
      w.riders.forEach((r, i) => {
        const apres = `${r.intent.kind}|${r.intent.effort}|${r.intent.effortMax}|${r.intent.sprint}|${r.intent.cible}|${r.intent.place}`;
        if (apres !== avant[i] && r.last?.t === decisions[i]) changementsHorsDecision++;
      });
    }
    expect(changementsHorsDecision).toBe(0);
  });
  it('Agir déclare des événements, ils couvrent limite-atteinte, fin-burst, place-atteinte, passage-termine', () => {
    const vus = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1800) {
        pas(w);
        for (const r of w.riders) for (const e of r.evenements) vus.add(e.type);
      }
    }
    expect(vus.has('limite-atteinte')).toBe(true);
    expect(vus.has('fin-burst')).toBe(true);
    expect(vus.has('place-atteinte')).toBe(true);
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

describe('v0.0.3b : les 7 intentions finales', () => {
  it('s\'abriter, se placer, participer, attaquer, suivre, revenir, gérer ; plus de relais ni de se rabattre', () => {
    expect([...INTENTIONS]).toEqual(['abriter', 'placer', 'participer', 'attaquer', 'suivre', 'revenir', 'gerer']);
    expect(Object.keys(INTENTION_LABEL).sort()).toEqual([...INTENTIONS].sort());
    expect(Object.keys(PLACE_LABEL).sort()).toEqual(['avant', 'derriere', 'garder', 'tete']);
  });
  it('la place visée est cohérente avec l\'intention (derrière : s\'abriter ou participer ; avant : se placer ; tête : participer)', () => {
    for (const seed of [1, 2, 3]) {
      const w = creerMonde({ seed });
      for (let i = 0; i < 4 * 900 && w.result.statut !== 'termine'; i++) {
        pas(w);
        for (const r of w.riders) {
          const { kind, place } = r.intent;
          if (place === 'derriere') expect(['abriter', 'participer']).toContain(kind);
          if (place === 'avant') expect(kind).toBe('placer');
          if (place === 'tete') expect(kind).toBe('participer');
        }
      }
    }
  });
  it('toutes les intentions finales apparaissent sur quelques courses (dont « se placer »)', () => {
    const vues = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const r of simuler(creerMonde({ seed })).riders) for (const k of INTENTIONS) if (r.stats.tempsParIntention[k] > 0) vues.add(k);
    expect([...vues].sort()).toEqual([...INTENTIONS].sort());
  });
});

describe('v0.0.3b : perception limitée, déduction par le comportement seul', () => {
  const sim = (seed: number, secondes: number) => { const w = creerMonde({ seed }); while (w.t < secondes && w.result.statut !== 'termine') pas(w); return w; };

  it('un coureur ne voit des autres ni leur profil, ni leur réserve, ni leur archétype', () => {
    const w = sim(3, 300);
    const permis = ['id', 'letter', 'dx', 'dy', 'vRel', 'posture', 'enLigne', 'accel'];
    for (const r of w.riders) {
      expect(r.vus.length).toBeGreaterThan(0);
      for (const q of r.vus) expect(Object.keys(q).sort()).toEqual([...permis].sort());
      const d = r.last!;
      const txt = JSON.stringify([d.percu.rivaux, d.interprete.autres]);
      for (const interdit of ['archetype', 'pointe', 'leadRecent', 'pPeak', 'wPrime', 'ftp', 'reserve', 'generosite']) expect(txt).not.toContain(interdit);
    }
  });
  it('ce que le coureur ressent de sa propre fatigue est approximatif : proche du réel, jamais exact', () => {
    const w = sim(4, 600);
    let ecartMax = 0, exacts = 0, n = 0;
    for (const r of w.riders) for (const d of w.trace.filter((t) => t.riderId === r.id)) {
      const e = Math.abs(d.percu.moi.reserve - d.reel.reserve);
      ecartMax = Math.max(ecartMax, e); n++; if (e < 1e-9) exacts++;
    }
    expect(n).toBeGreaterThan(20);
    expect(ecartMax).toBeLessThan(0.25);
    expect(exacts / n).toBeLessThan(0.1);
  });
  it('un coureur vu à l\'avant longtemps passe pour un rouleur, un suiveur pour un suiveur, un inconnu reste inconnu', () => {
    const base = { vu: 0, tete: 0, v: 10, accel: 0, accelMax: 0, derniereVue: 0 };
    expect(dispositionDe({ ...base, vu: 120, tete: 70 })).toBe('rouleur');
    expect(dispositionDe({ ...base, vu: 300, tete: 3 })).toBe('suiveur');
    expect(dispositionDe({ ...base, vu: 30, tete: 3 })).toBe('inconnu');
    expect(dispositionDe(undefined)).toBe('inconnu');
  });
  it('le danger supposé vient des accélérations observées, pas de la pointe', () => {
    const base = { vu: 100, tete: 0, v: 10, accel: 0, accelMax: 0, derniereVue: 0 };
    expect(dangerSuppose({ ...base, accelMax: 0.2 })).toBe(0);
    expect(dangerSuppose({ ...base, accelMax: 0.8 })).toBeGreaterThan(0.3);
    expect(dangerSuppose({ ...base, accelMax: 2 })).toBe(1);
    expect(dangerSuppose(undefined)).toBe(0);
  });
  it('au fil de la course, les coureurs se font une idée des autres (souvenirs, dispositions déduites)', () => {
    const w = sim(2, 900);
    let souvenirs = 0, dispo = 0;
    for (const r of w.riders) {
      const d = r.last!;
      souvenirs += Object.keys(r.memoire).length;
      dispo += d.interprete.autres.filter((a) => a.disposition !== 'inconnu').length;
    }
    expect(souvenirs).toBeGreaterThan(20);
    expect(dispo).toBeGreaterThan(0);
  });
  it('la perception du groupe : taille, allure et tendance existent', () => {
    const w = sim(5, 240);
    for (const r of w.riders) {
      const p = r.last!.percu;
      expect(p.moi.groupeTaille).toBeGreaterThanOrEqual(1);
      expect(p.rivaux.allure).toBeGreaterThan(0);
      expect(Number.isFinite(p.rivaux.tendanceAllure)).toBe(true);
    }
  });
});

describe('v0.0.3b : compétence d\'exécution et abri ressenti', () => {
  it('un coureur expérimenté tient une roue plus près, plus précisément, et réagit plus vite', () => {
    const a = executionDe(0.9), b = executionDe(0.3);
    expect(a.ecartConfort).toBeLessThan(b.ecartConfort);
    expect(a.precisionLat).toBeLessThan(b.precisionLat);
    expect(a.delai).toBeLessThan(b.delai);
    expect(a.pasAbri).toBeLessThan(b.pasAbri);
  });
  it('la recherche locale de l\'abri travaille (décalage non nul, borné) sans connaître le sillage', () => {
    const w = creerMonde({ seed: 6 });
    let max = 0, bouge = 0;
    for (let i = 0; i < 4 * 400; i++) {
      pas(w);
      for (const r of w.riders) { max = Math.max(max, Math.abs(r.geste.dyAbri)); if (r.geste.dyAbri !== 0) bouge++; }
    }
    expect(bouge).toBeGreaterThan(100);
    expect(max).toBeLessThanOrEqual(0.7 + 1e-9);
  });
  it('les coureurs s\'abritent vraiment : abri moyen élevé derrière une roue', () => {
    const w = creerMonde({ seed: 6 });
    const abris: number[] = [];
    for (let i = 0; i < 4 * 600; i++) { pas(w); if (i % 20 === 0 && i > 400) for (const r of w.riders) if (r.intent.kind === 'abriter' && r.intent.place === 'garder') abris.push(r.draft); }
    const moy = abris.reduce((x, y) => x + y, 0) / abris.length;
    expect(moy).toBeGreaterThan(0.2);
  });
});

describe('v0.0.3b : le relais se transmet par l\'arrière', () => {
  it('quitter la tête, passer devant, rejoindre : les événements existent et la tête change de mains', () => {
    const vus = new Set<string>(); let changements = 0;
    for (const seed of [1, 2, 3]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1500) { pas(w); for (const r of w.riders) for (const e of r.evenements) vus.add(e.type); }
      changements += w.changementsDeTete;
    }
    expect(vus.has('passage-termine')).toBe(true);
    expect(vus.has('place-atteinte')).toBe(true);
    expect(changements).toBeGreaterThan(40);
  });
  it('« être en tête » n\'est pas une intention : en tête on peut participer (mener) comme s\'abriter (reculer)', () => {
    const intentionsEnTete = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1200) { pas(w); const m = w.vue.meneur; if (m && w.t > 60) intentionsEnTete.add(m.intent.kind ?? '-'); }
    }
    expect(intentionsEnTete.has('participer')).toBe(true);
    expect(intentionsEnTete.has('abriter')).toBe(true);
  });
  it('les dépassements simultanés sont rares (un seul coureur hérite de la tête en pratique)', () => {
    let avecPasseur = 0, plusieurs = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1500) {
        pas(w);
        const n = w.riders.filter((r) => r.status === 'course' && r.intent.kind === 'participer' && r.intent.place === 'tete' && r.geste.phase === 'monte').length;
        if (n >= 1) avecPasseur++; if (n >= 2) plusieurs++;
      }
    }
    expect(avecPasseur).toBeGreaterThan(100);
    expect(plusieurs / avecPasseur).toBeLessThan(0.25);
  });
});

describe('v0.0.3b : tests de retrait des causes (docs/v0.0.3-chaine.md §4)', () => {
  const mesure = (prep: (w: ReturnType<typeof creerMonde>) => void, seeds: number[]) => {
    let groupes = 0, etendue = 0, ech = 0, cv = 0;
    for (const seed of seeds) {
      const w = creerMonde({ seed }); prep(w);
      while (w.result.statut !== 'termine' && w.t < 1500) {
        pas(w);
        if (w.t > 120 && Math.abs(w.t % 10) < 0.13) { groupes += w.vue.groupes.length; ech++; const xs = w.vue.ordre.map((r) => r.x); etendue += Math.max(...xs) - Math.min(...xs); }
      }
      const lt = w.riders.map((r) => r.stats.leadTime), m = lt.reduce((a, b) => a + b, 0) / lt.length;
      cv += Math.sqrt(lt.reduce((a, b) => a + (b - m) ** 2, 0) / lt.length) / Math.max(m, 1);
    }
    return { groupes: groupes / ech, etendue: etendue / ech, cv: cv / seeds.length };
  };
  const seeds = [1, 2, 3, 4, 5, 6];
  it('aspiration à zéro : le groupe se disperse', () => {
    const normal = mesure(() => {}, seeds);
    const base = ASPIRATION.base;
    ASPIRATION.base = 0;
    try {
      const sans = mesure(() => {}, seeds);
      expect(sans.etendue).toBeGreaterThan(normal.etendue * 1.15);
      expect(sans.groupes).toBeGreaterThan(normal.groupes);
    } finally { ASPIRATION.base = base; }
  }, 120000);
  it('huit profils identiques : pas de rouleur désigné, le temps en tête se répartit plus également', () => {
    const normal = mesure(() => {}, seeds);
    const identiques = mesure((w) => { const p0 = w.riders[0]!.profile; for (const r of w.riders) { r.profile = { ...p0 }; r.exec = w.riders[0]!.exec; } }, seeds);
    expect(identiques.cv).toBeLessThan(normal.cv * 0.85);
  }, 120000);
});

describe('v0.0.3b : garde-fou technique', () => {
  it('aucune course n\'est neutralisée sur 20 seeds (le garde-fou existe mais ne doit pas servir)', () => {
    let neutralisees = 0;
    for (let seed = 1; seed <= 20; seed++) { const w = simuler(creerMonde({ seed })); if (w.result.neutralisee) neutralisees++; expect(w.result.statut).toBe('termine'); }
    expect(neutralisees).toBe(0);
    expect(dureeMax(20000)).toBeGreaterThan(20000 / 8);
  }, 120000);
});

describe('v0.0.3c : plancher et place au moindre effort', () => {
  it('le plancher est le haut de Z3 et correspond à l\'allure réellement tenue (35-38 km/h seul)', () => {
    expect(PLANCHER).toBe(0.87);
    expect(palierDe(PLANCHER).code).toBe('Z3');
    for (let seed = 1; seed <= 20; seed++) for (const r of creerMonde({ seed }).riders) {
      const v = vitesseSolo(PLANCHER * r.profile.ftp, r.profile.cda, r.profile.mass, 2.5) * 3.6;
      expect(v).toBeGreaterThan(33); expect(v).toBeLessThan(40);
    }
  });
  it('le plancher personnel baisse avec la fatigue : un coureur fatigué ne peut plus tenir l\'allure', () => {
    const w = creerMonde({ seed: 5 });
    for (let i = 0; i < 4 * 60; i++) pas(w);
    const r = w.riders[0]!;
    const frais = (() => { r.E = 0.9; for (let i = 0; i < 12; i++) pas(w); return r.last!.interprete.plancher; })();
    const fatigue = (() => { r.E = 0.15; for (let i = 0; i < 12; i++) pas(w); return r.last!.interprete.plancher; })();
    expect(frais).toBeCloseTo(PLANCHER * capf(0.9), 1);
    expect(fatigue).toBeLessThan(frais - 0.1);
  });
  it('en tête, sans raison de ralentir, on roule à son plancher : l\'effort choisi vaut le plancher (à ± 0,12)', () => {
    const efforts: number[] = [];
    for (const seed of [1, 2, 3]) {
      const w = creerMonde({ seed });
      for (let i = 0; i < 4 * 900 && w.result.statut !== 'termine'; i++) {
        pas(w);
        for (const r of w.riders) if (r.intent.kind === 'participer' && r.intent.place === 'garder' && r.last && r.intent.effort !== null && r.last.interprete) efforts.push(r.intent.effort - r.last.interprete.plancher);
      }
    }
    expect(efforts.length).toBeGreaterThan(500);
    const moy = efforts.reduce((a, b) => a + b, 0) / efforts.length;
    expect(Math.abs(moy)).toBeLessThan(0.12);
  });
  it('porte ouverte : on lève le pied pour quelqu\'un qui se glisse à notre hauteur, à notre vitesse, à côté de la file', () => {
    const w = creerMonde({ seed: 3 });
    for (let i = 0; i < 40; i++) pas(w);
    const [r, m] = w.riders as [typeof w.riders[0], typeof w.riders[0]];
    m!.status = 'course'; r!.status = 'course';
    r!.x = 100; r!.v = 10; r!.y = axeY(w, 100);
    const place = (dx: number, dy: number, dv: number) => { m!.x = r!.x + dx; m!.y = axeY(w, m!.x) + dy; m!.v = r!.v + dv; return porteOuverte(w, r!, m!); };
    expect(place(0.5, 1.4, 0)).toBe(true);        // à côté, un peu devant, même vitesse
    expect(place(-0.5, -1.4, 0.2)).toBe(true);    // de l'autre côté de la file
    expect(place(0.5, 1.4, 1.0)).toBe(false);     // il passe (plus vite) : rien à ouvrir
    expect(place(0.5, 1.4, -1.0)).toBe(false);    // il se laisse glisser (moins vite)
    expect(place(0.5, 0.2, 0)).toBe(false);       // il est déjà dans la file
    expect(place(0.5, 3.5, 0)).toBe(false);       // trop loin sur le côté
    expect(place(8, 1.4, 0)).toBe(false);         // trop loin devant
    expect(place(-4, 1.4, 0)).toBe(false);        // déjà derrière
    expect(enLigne(w, r!)).toBe(true);
  });
  it('on se glisse vraiment au milieu du groupe : des coureurs se replacent derrière un coureur avec quelqu\'un juste derrière', () => {
    let insertions = 0;
    const vus = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const w = creerMonde({ seed });
      while (w.result.statut !== 'termine' && w.t < 1200) {
        pas(w);
        for (const r of w.riders) for (const e of r.evenements) if (e.type === 'place-atteinte' && !e.detail && r.intent.place === 'derriere') {
          const k = seed + ':' + r.id + '@' + e.t.toFixed(2); if (vus.has(k)) continue; vus.add(k);
          if (w.vue.ordre.some((o) => o !== r && o.x < r.x && r.x - o.x < 6)) insertions++;
        }
      }
    }
    expect(insertions).toBeGreaterThan(20);
  });
  it('les courses qui calaient en développement (seeds 9, 11, 17, 18, 24, 25, 54) finissent sans neutralisation', () => {
    for (const seed of [9, 11, 17, 18, 24, 25, 54]) { const w = simuler(creerMonde({ seed })); expect(w.result.neutralisee).toBe(false); }
  }, 120000);
  it('un petit groupe (4 coureurs) tourne : plusieurs coureurs mènent, personne ne reste devant tout le temps', () => {
    let tousMenent = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = simuler(creerMonde({ seed, nbCoureurs: 4 }));
      expect(w.result.statut).toBe('termine'); expect(w.result.neutralisee).toBe(false);
      if (w.riders.filter((r) => r.stats.relaisPris > 0).length >= 3) tousMenent++;
    }
    expect(tousMenent).toBeGreaterThanOrEqual(3);
  }, 120000);
});
