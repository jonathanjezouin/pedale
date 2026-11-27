# Pédale — Structuration du code

> Préconisation pour tous les chantiers. Elle est mise en place et validée par le chantier 1 (voir `chantiers.md`), puis elle s'impose.
> Les noms de types sont indicatifs : ce qui compte, ce sont les frontières et le sens des flux.

## 1. Idée directrice

Un coureur est une **chaîne de quatre fonctions**, et rien d'autre ne décide à sa place :

```
 MONDE (vérité)                                   COUREUR
 ┌──────────────┐   observation    ┌───────────────────────────────────────────┐
 │ route, vent  │ ───────────────▶ │ 1 PERCEVOIR   : monde + moi  → Perçu       │
 │ autres       │                  │ 2 INTERPRÉTER : Perçu        → Croyances   │
 │ coureurs     │                  │ 3 VOULOIR     : Croyances    → Volontés    │
 │ physique     │ ◀─────────────── │ 4 AGIR        : Volontés     → Commandes   │
 └──────────────┘    commandes     └───────────────────────────────────────────┘
        │                                         │
        └──── la physique applique les commandes ─┘      chaque étage écrit sa TRACE
```

Trois conséquences qui évitent de « partir dans tous les sens » :

1. **Seule la physique modifie la position et l'énergie d'un coureur.** Les étages de décision produisent des données, jamais des effets.
2. **Un étage ne lit que la sortie de l'étage précédent** (plus sa propre mémoire explicite). En particulier, *Vouloir* et *Agir* ne voient jamais la vérité du monde, seulement les croyances. C'est ce qui rend possible le brouillard de perception (chantier 9) sans rien réécrire.
3. **Tout ce qu'une fonctionnalité ajoute a une place prévue** : elle s'ajoute à un étage, pas à côté. Le tableau du §6 indique laquelle.

## 2. Les cinq couches du code

```
packages/sim/src/
  contrats/     types partagés : Observation, Perçu, Croyances, Volontés, Commandes, Trace  (aucune logique)
  monde/        route, vent, physique, autres coureurs : la vérité. N'importe ni esprit/ ni app
  esprit/       percevoir/ interpreter/ vouloir/ agir/  : n'importe que contrats/
  trace/        enregistrement et lecture des traces
  moteur/       la boucle : pas fixe, ordre d'appel, seed. Seul endroit qui connaît tout
apps/jeu/       affichage, interface, entrées clavier : lit des instantanés, n'écrit jamais dans monde/
```

**Règles de dépendance** (vérifiées automatiquement, chantier 1) :

| Couche | Peut importer | Ne peut jamais importer |
|---|---|---|
| `contrats` | rien | tout |
| `monde` | `contrats` | `esprit`, `apps` |
| `esprit` | `contrats` | `monde`, `apps` |
| `moteur` | tout de `sim` | `apps` |
| `apps` | `contrats`, `moteur` (via instantané) | `monde`, `esprit` en écriture |

Autres règles communes :
- **Pas de `Math.random` ni de `Date`** dans `sim` : le hasard vient d'un générateur seedé passé en paramètre.
- **Pas fixe** (par exemple 0,25 s). L'accélération du temps enchaîne plusieurs pas par image ; le résultat ne doit pas dépendre du nombre d'images.
- **Unités SI partout** (mètres, secondes, watts, radians) dans `sim`. Les conversions (km/h…) n'existent qu'à l'affichage.
- **Tous les paramètres chiffrés** (poids, SCx, seuils…) vivent dans des fichiers de configuration nommés, avec unité et source, pas dans la logique.
- **Une fonction d'étage est pure** : mêmes entrées, mêmes sorties. L'état persistant du coureur (mémoire) est une donnée explicite passée en entrée et rendue en sortie.

## 3. Les données qui circulent

Quatre sortes de données, une par frontière. Elles sont petites et lisibles.

- **Observation** (monde → coureur) : ce que le monde *expose* au coureur : la route devant lui, le vent ressenti, les coureurs visibles autour avec leur position relative, ses propres jambes. Elle est construite par `monde/`, qui décide de ce qui est visible. C'est le seul point où l'on triche ou non avec la vérité.
- **Perçu** : l'Observation après bruit de perception (biais, retard, grossièreté). Au début, Perçu = Observation.
- **Croyances** : ce que le coureur en conclut (« je suis frais », « il me reste 18 km », « ce groupe va vite »). Contient l'estimation du reste à parcourir (chantier 4).
- **Volontés** : voir §4.
- **Commandes** : ce que le corps tente de faire, au niveau le plus bas. Très peu de commandes : une **puissance visée** (W), un **déplacement latéral visé** (m ou vitesse latérale), éventuellement un freinage. La physique les applique **avec ses limites** : ce qui est demandé n'est pas toujours obtenu (la défaillance d'exécution se loge ici).

## 4. Plusieurs niveaux de « vouloir »

Ton exemple : « je veux rester dans ce groupe **et** améliorer mon abri ». Ce ne sont pas deux envies concurrentes, c'est une envie qui en cadre une autre. On modélise donc *Vouloir* comme une **pile de niveaux**, chacun avec son horizon de temps :

| Niveau | Horizon | Exemples | Change |
|---|---|---|---|
| **Objectif** | étape entière, heures | gagner, finir dans le temps, protéger mon leader | rarement : rôle, contrat, consigne du DS |
| **Intention** | minutes | rester dans ce groupe, attaquer, revenir, laisser filer | sur engagement terminé ou déclencheur |
| **Manœuvre** | secondes | améliorer mon abri, prendre la roue de X, passer à gauche, relancer | souvent |

Puis vient **Agir**, qui n'est plus une volonté mais la traduction en **Commandes**.

Fonctionnement, identique à chaque niveau :

```
Volonté(niveau n) = choisir( Croyances, Cadre reçu du niveau n-1, ma mémoire )
                    → { ce que je veux, raisons nommées, Cadre pour le niveau n+1, échéance et déclencheurs }
```

- **Le niveau supérieur donne un cadre, pas un ordre.** « Rester dans ce groupe » donne comme cadre : « écart à la roue la plus proche ≤ 10 m, puissance ≤ ma puissance soutenable + 15 % ». Le niveau Manœuvre cherche le meilleur abri *à l'intérieur* de ce cadre.
- **Chaque niveau a sa cadence de réévaluation** : l'Objectif presque jamais, l'Intention sur déclencheur (fin de relais, attaque d'un rival, pied de côte), la Manœuvre en continu.
- **Le niveau inférieur peut remonter une impossibilité** (« je ne peux plus rester dans ce cadre : réserve vide »). Le niveau au-dessus réévalue alors. C'est le *veto* du design fonctionnel, qui devient un mécanisme général.
- **Les priorités sont autre chose que les niveaux.** La hiérarchie « survie > consigne > objectif > opportunisme » dit *quelle raison pèse le plus* dans un choix. Elle ne dit pas *à quel niveau* le choix se fait. On ne mélange pas les deux.
- **Chaque niveau écrit ses raisons**, ce qui donne la trace « pourquoi ? » complète : « J'attaque (intention) parce que… ; je le fais en passant à gauche (manœuvre) parce que… ».

Ce découpage est une **hypothèse de départ à affiner** dans le chantier 1 puis aux chantiers 7 et 8. On pourra fusionner Objectif et Intention au début si cela suffit, mais l'interface (cadre descendant, impossibilité remontante) reste la même.

## 5. Trace, joueur, rendu

- **Trace** : chaque étage, à chaque décision, produit un enregistrement structuré : ce qu'il a reçu, ce qu'il a produit, et ses raisons. Aucune décision n'existe sans trace. L'interface « pourquoi ? », les tests et les statistiques lisent la même structure. La trace sait garder le **perçu et le réel côte à côte** (« je me crois frais, réel : 70 % »).
- **Joueur** : le joueur remplace *Vouloir* et *Agir* de son coureur. Il se branche en un point unique et propre : il fournit soit des **Volontés** (« attaque »), soit directement des **Commandes** (puissance, déplacement). Pour la physique, un coureur piloté et un coureur IA sont indiscernables. Le joueur ne reçoit que **Perçu** et **Croyances**, comme l'IA.
- **Rendu** : le moteur publie à chaque pas un **instantané immuable** (positions, états, trace récente). L'affichage l'interpole entre deux pas pour la fluidité. Il n'écrit jamais dans `monde/`. Si un défaut est visuel, la simulation est hors de cause, et inversement.

## 6. Où chaque chantier s'insère

| Chantier | Étage(s) touché(s) | Ce qui est ajouté |
|---|---|---|
| 1 Architecture | tous (squelette) | contrats, règles, coureur témoin avec chaîne complète triviale |
| 2 Route | `monde` | route, profil, repère `(s, d)` ; **Observation** : la route devant |
| 3 Physique et énergie | `monde` (physique), `agir` (puissance) | applique les Commandes ; deux réserves ; observation de ses propres jambes |
| 4 Estimation du reste | `interpréter`, `vouloir` | Croyances sur le reste à parcourir ; Intention « tenir un plan d'effort » |
| 5 Trajectoire | `vouloir` (Manœuvre), `agir` (latéral) | Manœuvre « ligne » ; Commande de déplacement latéral |
| 6 Aspiration | `monde` (physique), `percevoir` | sillage dans la physique ; observation des coureurs proches |
| 7 Groupe | `interpréter`, `vouloir` | Croyances sur le groupe ; Intentions « rester dans le groupe », « prendre un relais »… |
| 8 Décision | `vouloir` (tous niveaux) | raisons nommées, vetos, hiérarchie complète, profils de coureurs |
| 9 Joueur | `percevoir`, injection | brouillard de perception, remplacement de Vouloir/Agir, radio |

Le point de vigilance : **un coureur seul (chantiers 3 à 5) utilise déjà la chaîne complète.** Sa décision est simple, mais elle passe par les quatre étages et laisse une trace, de sorte qu'aucun chantier n'a à « ajouter l'architecture » après coup.

## 7. Ce qu'on refuse explicitement

- Un coureur qui lit directement l'état d'un autre coureur ou du monde sans passer par l'Observation.
- Une fonction de décision qui modifie la position, la vitesse ou l'énergie.
- Un comportement qui n'existe que dans l'affichage (si on le voit, il est dans la simulation).
- Une constante magique dans la logique.
- Un « cas particulier » dans `moteur` pour un type de coureur : l'individualité vient des paramètres, pas du code.

## 8. Décisions du chantier 1

Statut : **retenu pour démarrer**, à réviser aux chantiers 7 et 8 si l'expérience l'exige. Les points marqués « par défaut » n'ont pas été tranchés en profondeur : on a pris le choix le plus simple et le moins coûteux à changer.

1. **Niveaux de Vouloir** : trois (Objectif, Intention, Manœuvre) dès le début. *(décidé)*
2. **Cadre descendant** : *par défaut*, un cadre est une liste de **bornes simples** sur des grandeurs que le niveau inférieur produit ou observe (ex. « puissance visée ≤ X W », « écart à la roue la plus proche ≤ 10 m »). Le niveau inférieur choisit librement à l'intérieur ; un test peut vérifier qu'il n'en sort jamais.
3. **Remontée d'impossibilité** : *par défaut*, **immédiate** : dès qu'un niveau constate qu'il ne peut plus respecter son cadre, le niveau juste au-dessus (et lui seul) se réévalue au pas suivant, sans attendre sa cadence normale.
4. **Point d'injection du joueur** : *par défaut*, un point unique qui accepte soit des Volontés, soit des Commandes. La source externe ne reçoit que Perçu et Croyances. *(l'idée convient, détails à confirmer au chantier 9)*
5. **Mémoire du coureur** : *par défaut*, **un bloc de mémoire par étage**, passé en entrée et rendu en sortie de la fonction (fonctions pures), et visible dans la trace.

### Précisions apprises en construisant l'UF 1.4

- **Réévaluation d'un niveau** : première fois, échéance atteinte, déclencheur qui vient d'**apparaître** (front montant : un événement qui dure ne redéclenche pas), cadre reçu modifié, ou impossibilité remontée. La cause est écrite en première raison du niveau (`reevaluation:…`).
- **Remontée** : immédiate, vers le niveau juste au-dessus seulement, au plus une fois par niveau et par pas ; les niveaux en dessous se réévaluent ensuite car leur cadre a pu changer. Seule une impossibilité **nouvelle** remonte.
- **Impossibilité** : un niveau est impossible quand son cadre ne lui laisse pas de quoi tenir ce qui est voulu, pas quand il est simplement plafonné en cours d'accélération.
- **Cadre figé entre deux réévaluations** : un niveau supérieur n'est pas recalculé à chaque pas ; le cadre peut donc être un peu périmé, ce qui est voulu (un cadre, pas un ordre).
- **Valeurs voulues** : une `Volonte` porte des `visees` chiffrées (ex. vitesse visée de l'intention, puissance visée de la manœuvre) ; Agir ne lit que celles de la manœuvre.

