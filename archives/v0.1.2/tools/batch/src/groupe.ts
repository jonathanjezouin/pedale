/* Banc d'essai du comportement de groupe (docs/v0.1.2-groupe.md §8) : groupes de 4 et de 8 coureurs, route plate, 1 500 s.
   Les mesures sont recalculées depuis les positions : le meneur n'est pas `w.meneurId` (qui a une hystérésis propre) mais le coureur le plus en avant,
   avec un changement de meneur compté seulement s'il garde l'avant 3 s d'affilée. */
import { creerMonde, pas, RIDER_LEN } from '@pedale/sim';
import type { World } from '@pedale/sim';

const arg = (name: string, def: string) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1]! : def; };
const N = Number(arg('n', '20')), DUR = Number(arg('dur', '1500')), SEED0 = Number(arg('seed0', '1'));
const TAILLES = arg('tailles', '4,8').split(',').map(Number), VENTS = arg('vents', 'fixe,face').split(',') as ('fixe' | 'face')[];
const ARCH4 = ['rouleur', 'sprinteur', 'attaquant', 'opportuniste'] as const;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0; };
const moy = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pc = (x: number, d = 0) => (100 * x).toFixed(d) + ' %';

export interface Mesures {
  toursParCourse: number; dureeMed: number; duree10: number; duree90: number; partMoins10s: number; meneurs: number; partMax: number; partMin: number;
  pertes: number; abriMoyen: number; abriSous10: number; longueur: Record<string, number>; frolements: number; vitesse: number;
}

export function mesurer(n: number, vent: 'fixe' | 'face', seeds: number[], dur: number): Mesures {
  const stints: number[] = [], pertes: number[] = [], abri: number[] = [], distincts: number[] = [], froles: number[] = [], vit: number[] = [];
  const longueur: Record<string, number[]> = { '<0.9': [], '0.9-1.0': [], '>1.0': [] }; const parts: number[] = [];
  for (const seed of seeds) {
    const w: World = creerMonde({ seed, nbCoureurs: n, ventMode: vent, ...(n === 4 ? { composition: [...ARCH4] } : {}) } as never);
    let lead = -1, since = 0, cand = -1, candDepuis = 0, perte = 0, frol = 0; const tete = new Array(n).fill(0); const vus = new Set<number>();
    const contact = new Map<number, { roue: number; depuis: number }>(); const enPerte = new Set<number>(); const touche = new Set<string>();
    while ((w.result.statut as string) !== 'termine' && w.t < dur) {
      pas(w);
      const act = w.riders.filter((r) => r.status === 'course'); if (act.length < 2) break;
      const front = act.reduce((a, b) => (b.x > a.x ? b : a));
      if (lead < 0) { lead = front.id; since = w.t; cand = -1; }
      else if (front.id !== lead && front.x - w.riders[lead]!.x >= 0.5) { if (cand !== front.id) { cand = front.id; candDepuis = w.t; } if (w.t - candDepuis >= 3) { stints.push(w.t - since); lead = cand; since = w.t; cand = -1; } }
      else cand = -1;
      tete[lead] += w.cfg.dt; vus.add(lead);
      const xs = act.map((r) => r.x), lon = Math.max(...xs) - Math.min(...xs), L = w.riders[lead]!; const ratio = L.p / L.profile.ftp;
      longueur[ratio < 0.9 ? '<0.9' : ratio <= 1.0 ? '0.9-1.0' : '>1.0']!.push(lon);
      for (const r of act) {
        if (r.id !== lead) abri.push(r.draft);
        // frôlements : deux coureurs à moins de 0,2 m de roue à roue et de 0,4 m de côté
        for (const o of act) if (o.id > r.id) { const k = `${r.id}-${o.id}`; const proche = Math.abs(o.x - r.x) - RIDER_LEN < 0.2 && Math.abs(o.y - r.y) < 0.4; if (proche && !touche.has(k)) { touche.add(k); frol++; } else if (!proche) touche.delete(k); }
        const id = r.geste.roueId; const o = id !== null ? w.riders[id]! : null;
        if (!o || r.intent.kind !== 'abriter' || Math.abs(o.y - r.y) > 2) { contact.delete(r.id); enPerte.delete(r.id); continue; }
        const gap = o.x - r.x - RIDER_LEN;
        if (enPerte.has(r.id)) { if (gap < 1.5 || gap > 40) enPerte.delete(r.id); continue; }
        if (gap < 2 && gap >= 0) { const c = contact.get(r.id); if (!c || c.roue !== id) contact.set(r.id, { roue: id, depuis: w.t }); continue; }
        const c = contact.get(r.id); if (c && c.roue === id && w.t - c.depuis >= 5 && gap > 6 && gap < 40) { perte++; enPerte.add(r.id); contact.delete(r.id); }
      }
    }
    stints.push(w.t - since); pertes.push(perte); distincts.push(vus.size); froles.push(frol); parts.push(Math.max(...tete) / Math.max(1, w.t), Math.min(...tete) / Math.max(1, w.t));
    vit.push(moy(w.riders.map((r) => r.x)) / Math.max(1, w.t) * 3.6);
  }
  const L2: Record<string, number> = {}; for (const [k, v] of Object.entries(longueur)) L2[k] = moy(v);
  return {
    toursParCourse: stints.length / seeds.length, dureeMed: q(stints, 0.5), duree10: q(stints, 0.1), duree90: q(stints, 0.9), partMoins10s: stints.filter((s) => s < 10).length / stints.length,
    meneurs: moy(distincts), partMax: moy(parts.filter((_, i) => i % 2 === 0)), partMin: moy(parts.filter((_, i) => i % 2 === 1)),
    pertes: moy(pertes), abriMoyen: moy(abri), abriSous10: abri.filter((a) => a < 0.1).length / abri.length, longueur: L2, frolements: moy(froles), vitesse: moy(vit),
  };
}

if (process.argv[1] && /groupe\.ts$/.test(process.argv[1])) {
  const seeds = Array.from({ length: N }, (_, i) => SEED0 + i);
  console.log(`# Banc d'essai de groupe — ${N} courses de ${DUR} s par cas, route plate (docs/v0.1.2-groupe.md §8)\n`);
  console.log('| Mesure | ' + TAILLES.flatMap((n) => VENTS.map((v) => `${n} coureurs, vent ${v}`)).join(' | ') + ' |');
  console.log('|---|' + TAILLES.flatMap(() => VENTS.map(() => '---')).join('|') + '|');
  const res = TAILLES.flatMap((n) => VENTS.map((v) => mesurer(n, v, seeds, DUR)));
  const ligne = (nom: string, f: (m: Mesures) => string) => console.log(`| ${nom} | ${res.map(f).join(' | ')} |`);
  ligne('Vitesse moyenne (km/h)', (m) => m.vitesse.toFixed(1));
  ligne('Tours en tête par course', (m) => m.toursParCourse.toFixed(0));
  ligne('Durée médiane d\'un tour (10e-90e centile)', (m) => `${m.dureeMed.toFixed(0)} s (${m.duree10.toFixed(0)}-${m.duree90.toFixed(0)})`);
  ligne('Tours de moins de 10 s', (m) => pc(m.partMoins10s));
  ligne('Meneurs distincts par course', (m) => m.meneurs.toFixed(1));
  ligne('Part du temps en tête : le plus / le moins présent', (m) => `${pc(m.partMax)} / ${pc(m.partMin)}`);
  ligne('Vraies pertes de roue par course', (m) => m.pertes.toFixed(1));
  ligne('Abri moyen hors tête', (m) => pc(m.abriMoyen));
  ligne('Part du temps à moins de 10 % d\'abri (hors tête)', (m) => pc(m.abriSous10));
  ligne('Longueur du groupe, meneur < 0,9 / 0,9-1,0 / > 1,0 FTP (m)', (m) => `${m.longueur['<0.9']!.toFixed(0)} / ${m.longueur['0.9-1.0']!.toFixed(0)} / ${m.longueur['>1.0']!.toFixed(0)}`);
  ligne('Frôlements par course', (m) => m.frolements.toFixed(1));
}
