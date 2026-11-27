import { VERSION_SIM, creerAlea } from '@pedale/sim';

const alea = creerAlea(1);
const app = document.getElementById('app');
if (app) {
  app.textContent = `Pédale — socle (sim ${VERSION_SIM}, premier tirage de la seed 1 : ${alea.suivant().toFixed(6)})`;
}
