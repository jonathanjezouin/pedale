import { VERSION_SIM, creerSimulation } from '@pedale/sim';
import { secondes } from './format.ts';
import { rendrePanneau } from './panneau.ts';
import './style.css';

const COUREUR = 'temoin';
const sim = creerSimulation(1, { capaciteJournal_n: 2000 });

let enPause = false;
let vitesse = 1; // secondes simulées par seconde réelle
let rang = 0; // rang de la décision affichée quand on est en pause
let accumule_s = 0;
let derniereCle = '';

const app = document.getElementById('app');
if (!app) throw new Error('#app introuvable');

const bouton = (texte: string, titre: string, action: () => void): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = texte;
  b.title = titre;
  b.addEventListener('click', action);
  return b;
};
const bPause = bouton('Pause', 'Espace', () => basculerPause());
const bPrec = bouton('◀', 'Décision précédente (flèche gauche)', () => aller(-1));
const bSuiv = bouton('▶', 'Décision suivante (flèche droite)', () => aller(1));
const selVitesse = document.createElement('select');
selVitesse.title = 'Vitesse de la simulation';
for (const v of [1, 8, 64]) selVitesse.append(new Option(`×${v}`, String(v)));
selVitesse.addEventListener('change', () => { vitesse = Number(selVitesse.value); });
const position = document.createElement('span');
position.className = 'position';

const entete = document.createElement('header');
const titre = document.createElement('h1');
titre.textContent = `Pédale — coureur témoin (sim ${VERSION_SIM})`;
const commandes = document.createElement('div');
commandes.className = 'commandes';
commandes.append(bPause, bPrec, bSuiv, selVitesse, position);
entete.append(titre, commandes);
const panneau = document.createElement('main');
panneau.className = 'panneau';
app.append(entete, panneau);

function basculerPause(): void {
  enPause = !enPause;
  if (enPause) rang = Math.max(0, sim.journal.taille_n(COUREUR) - 1);
}

function aller(delta: number): void {
  if (!enPause) basculerPause();
  rang = Math.min(sim.journal.taille_n(COUREUR) - 1, Math.max(0, rang + delta));
}

addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); basculerPause(); }
  else if (e.key === 'ArrowLeft') aller(-1);
  else if (e.key === 'ArrowRight') aller(1);
});

function afficher(): void {
  const n = sim.journal.taille_n(COUREUR);
  const r = enPause ? Math.min(rang, n - 1) : n - 1;
  const cle = `${enPause}|${r}|${sim.journal.totalEnregistre_n()}`;
  if (cle === derniereCle) return;
  derniereCle = cle;
  const t = sim.journal.lire(COUREUR, r);
  bPause.textContent = enPause ? 'Reprendre' : 'Pause';
  bPrec.disabled = r <= 0;
  bSuiv.disabled = !enPause || r >= n - 1;
  position.textContent = t
    ? `décision ${r + 1} / ${n} gardées · t = ${secondes(t.instant_s)}${enPause ? '' : ' · en direct'}`
    : '';
  rendrePanneau(panneau, t);
}

let precedent = performance.now();
function image(maintenant: number): void {
  const dt_s = Math.min((maintenant - precedent) / 1000, 0.1);
  precedent = maintenant;
  if (!enPause) {
    accumule_s += dt_s * vitesse;
    const pas_s = sim.instantane().pas_s;
    const n = Math.floor(accumule_s / pas_s);
    if (n > 0) { accumule_s -= n * pas_s; sim.avancer(n); }
  }
  afficher();
  requestAnimationFrame(image);
}
sim.avancer(1); // une première décision à montrer dès l'ouverture
requestAnimationFrame(image);
