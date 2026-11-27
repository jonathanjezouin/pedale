// Mesures automatiques du défilement graphique (UF 2.6) dans un vrai navigateur (Chromium piloté par Playwright).
// Hors de `npm test` : il faut un navigateur. Mode d'emploi :
//   1. npm run dev                      (dans un terminal)
//   2. node tools/mesure-defilement.mjs [--url http://localhost:5173] [--rapide]
// Playwright : `npm i -D playwright`, ou PLAYWRIGHT_DIR=/chemin/contenant/node_modules. Node ≥ 22.18 (import de fichiers .ts).
// Code de sortie 1 si un critère n'est pas tenu. --rapide : durées réduites (vérification, pas certification).
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const url = (args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173').replace(/\/$/, '');
const rapide = args.includes('--rapide');

async function chargerPlaywright() {
  try { return await import('playwright'); } catch { /* repli */ }
  if (process.env.PLAYWRIGHT_DIR) return createRequire(process.env.PLAYWRIGHT_DIR.replace(/\/?$/, '/'))('playwright');
  throw new Error('Playwright introuvable : `npm i -D playwright`, ou PLAYWRIGHT_DIR=/chemin/contenant/node_modules');
}
const { chromium } = await chargerPlaywright();
const { creerEtape } = await import('../packages/sim/src/moteur/etape.ts');

const resultats = [];
const verdict = (critere, ok, detail) => { resultats.push({ critere, ok }); console.log(`  ${ok ? 'OK    ' : 'ÉCHEC '} ${critere} — ${detail}`); };
const quantile = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const moyenne = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const mediane = (a) => quantile(a, 0.5);

const nav = await chromium.launch();
const ouvrir = async (hash, dpr = 1) => {
  const page = await nav.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: dpr });
  await page.goto(`${url}/#defilement${hash}`);
  await page.waitForTimeout(900);
  return page;
};

// ── 1. couverture : pas de trou ni de couture ─────────────────────────────────────────────────────────────────────
console.log('\n1. Couverture de la route (sol magenta, accotements verts, chaussée grise : aucun pixel faux sur la route)');
{
  const etape = creerEtape(1, 'montagne', 200_000);
  const positions = [];
  for (const z of etape.lacets.slice(0, 12)) positions.push(Math.round((z.debut_m + z.fin_m) / 2), Math.round(z.debut_m), Math.round(z.fin_m));
  for (let k = 1; k <= 40; k++) positions.push(k * 200 - 1, k * 200 + 1); // de part et d'autre des frontières de blocs
  for (let s = 50; s < 30_000; s += 411) positions.push(s);
  const page = await ouvrir('?type=montagne&km=200&graine=1');
  let points = 0, erreurs = 0;
  for (const orientation of ['cap', 'nord']) for (const zoom of [1, 2, 4]) {
    const r = await page.evaluate((o) => window.__defilement.couverture(o), { positions, orientation, zoom });
    points += r.points; erreurs += r.erreurs;
    if (r.erreurs) console.log('    ', orientation, 'zoom ×' + zoom, r.exemples.join(' | '));
  }
  verdict('aucune couture, aucun trou', erreurs === 0, `${points} pixels contrôlés sur ${positions.length} positions (dont ${etape.lacets.length > 12 ? 12 : etape.lacets.length} séries de lacets et les frontières de blocs), 2 orientations × 3 zooms, ${erreurs} erreur(s)`);
  await page.close();
}

// ── 2. l'image affichée est celle du modèle de caméra ─────────────────────────────────────────────────────────────
console.log('\n2. Position vue d\'un poteau kilométrique comparée à la position prédite par la caméra');
{
  let pire = 0, n = 0, manques = 0;
  for (const dpr of [1, 2]) {
    const page = await ouvrir('?type=montagne&km=200&graine=1', dpr);
    for (const orientation of ['cap', 'nord']) for (const zoom of [1, 2, 4]) {
      const positions = []; for (let k = 1; k <= 60; k++) positions.push(k * 1000 - 25 / zoom + (((k * 37) % 20) - 10) / zoom);
      const r = await page.evaluate((o) => window.__defilement.ecartPoteauKm(o), { positions, orientation, zoom });
      n += r.ecarts_px.length; manques += r.manques; pire = Math.max(pire, ...r.ecarts_px);
    }
    await page.close();
  }
  verdict('image conforme au modèle', pire <= 1 && manques === 0, `${n} poteaux, écart maximal ${pire.toFixed(2)} px (précision de la mesure : ~0,5 px), ${manques} manqué(s)`);
}

// ── 3. vitesse apparente constante hors virages ───────────────────────────────────────────────────────────────────
console.log('\n3. Vitesse apparente d\'un repère du sol (plaine, ligne droite sur [−5 m, +190 m] autour du coureur)');
{
  const page = await ouvrir('?type=plaine&km=200&graine=2&o=cap');
  let pire = 0, images = 0;
  for (const v of [5, 12, 25]) for (const k of [1, 4, 16]) {
    const m = await page.evaluate((o) => window.__defilement.mesurer(o), { vitesse_m_s: v, acceleration: k, duree_reelle_s: rapide ? 5 : 12, debut_m: 2000 });
    for (const x of m.vitesseApparente_px_s) pire = Math.max(pire, Math.abs(x / m.vitesseAttendue_px_s - 1));
    images += m.vitesseApparente_px_s.length;
  }
  verdict('écart ≤ 5 %', pire <= 0.05, `${images} images en ligne droite, 5 à 25 m/s, ×1 à ×16 : écart maximal ${(100 * pire).toFixed(4)} %`);
  await page.close();
}

// ── 4. durée d'image ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. Durée d\'image (montagne 200 km, 25 m/s, départ au km 3)');
{
  const duree = rapide ? 6 : 15;
  let total = 0, lentes = 0, tresLentes = 0, pireInterv = 0, pireDessin = 0;
  const lignes = [];
  for (const dpr of [1, 2]) for (const orientation of ['cap', 'nord']) {
    const page = await ouvrir(`?type=montagne&km=200&graine=1&o=${orientation}`, dpr);
    for (const k of [1, 4, 16, 64]) {
      const m = await page.evaluate((o) => window.__defilement.mesurer(o), { vitesse_m_s: 25, acceleration: k, duree_reelle_s: duree, debut_m: 3000 });
      const i = m.intervalles_ms, d = m.dessin_ms;
      total += i.length; lentes += i.filter((x) => x > 20).length; tresLentes += i.filter((x) => x > 50).length;
      pireInterv = Math.max(pireInterv, ...i); pireDessin = Math.max(pireDessin, ...d);
      lignes.push(`DPR ${dpr} ${orientation.padEnd(4)} ×${String(k).padEnd(2)} : ${i.length} images, p50 ${quantile(i, .5).toFixed(1)} p99 ${quantile(i, .99).toFixed(1)} max ${Math.max(...i).toFixed(1)} ms | dessin moy ${moyenne(d).toFixed(2)} max ${Math.max(...d).toFixed(1)} ms | blocs construits ${m.construits}`);
    }
    await page.close();
  }
  for (const l of lignes) console.log('    ' + l);
  verdict('99 % des images sous 20 ms', lentes / total <= 0.01, `${total} images, ${lentes} au-dessus de 20 ms (${(100 * lentes / total).toFixed(3)} %)`);
  verdict('aucune image au-dessus de 50 ms', tresLentes === 0, `${tresLentes} image(s) au-dessus de 50 ms ; plus longue ${pireInterv.toFixed(1)} ms ; plus long dessin ${pireDessin.toFixed(1)} ms`);
}

// ── 5. mémoire ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. Mémoire : défilement de toute l\'étape à ×64 (tas JavaScript après ramasse-miettes)');
{
  const page = await ouvrir('?type=montagne&km=200&graine=1&o=nord');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const tas = async () => { await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); return metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1e6; };
  const duree = rapide ? 45 : 135;
  const course = page.evaluate((o) => window.__defilement.mesurer(o), { vitesse_m_s: 25, acceleration: 64, duree_reelle_s: duree, debut_m: 0 });
  let fini = false; course.then(() => { fini = true; });
  const pts = [];
  while (!fini) { await new Promise((r) => setTimeout(r, 5000)); if (!fini) pts.push(await tas()); }
  const m = await course;
  const t = Math.floor(pts.length / 3);
  // médianes (et non moyennes) : une pointe isolée du tas, juste avant un ramasse-miettes, n'est pas une fuite
  const t2 = mediane(pts.slice(t, 2 * t)), t3 = mediane(pts.slice(2 * t));
  const croissance = t3 / t2 - 1;
  console.log(`    ${m.intervalles_ms.length} images, ${((m.s_fin_m - m.s_debut_m) / 1000).toFixed(0)} km parcourus, tas ${pts.map((x) => x.toFixed(1)).join(' ')} Mo`);
  verdict('mémoire stable après stabilisation', croissance <= 0.05, `tas médian ${t2.toFixed(2)} → ${t3.toFixed(2)} Mo entre le 2e et le 3e tiers (${(100 * croissance).toFixed(2)} %)`);
  verdict('cache de blocs borné', Math.max(...m.blocsEnCache) <= 96, `${Math.max(...m.blocsEnCache)} blocs en mémoire au plus (limite 96), ${m.construits} construits pour ${Math.ceil(m.s_fin_m / 200)} blocs de route parcourus`);
  await page.close();
}

await nav.close();
const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - echecs.length} / ${resultats.length} critères tenus${echecs.length ? ' — ÉCHECS : ' + echecs.map((r) => r.critere).join(' ; ') : ''}`);
process.exit(echecs.length ? 1 : 0);
