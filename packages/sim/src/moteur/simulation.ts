import type { CoureurId } from '../contrats/index.ts';
import { creerJournal, type JournalTraces } from '../trace/index.ts';
import { pas, type Dependances } from './pas.ts';
import { creerPartieTemoin, DEPENDANCES_TEMOIN } from './temoin.ts';

/** Photo immuable de ce qu'une interface a besoin d'afficher. Elle ne permet d'écrire dans rien. */
export interface Instantane {
  readonly instant_s: number;
  readonly pas_s: number;
  readonly coureurs: readonly {
    readonly id: CoureurId;
    readonly s_m: number;
    readonly d_m: number;
    readonly vitesse_m_s: number;
    readonly puissance_w: number;
    readonly reserveLongue_ratio: number;
  }[];
}

/**
 * Seul moyen d'avancer le temps pour une interface. Chaque pas enregistre forcément les traces de
 * toutes les décisions prises : il n'existe pas de décision sans trace.
 */
export interface Simulation {
  /** Avance de `nbPas_n` pas fixes. Le résultat ne dépend pas de la façon dont on découpe les appels. */
  avancer(nbPas_n: number): void;
  readonly journal: JournalTraces;
  instantane(): Instantane;
}

export interface OptionsSimulation {
  readonly capaciteJournal_n?: number;
  readonly dependances?: Dependances;
}

export function creerSimulation(graine: number, options: OptionsSimulation = {}): Simulation {
  const dep = options.dependances ?? DEPENDANCES_TEMOIN;
  const journal = creerJournal(options.capaciteJournal_n ?? 2000);
  let partie = creerPartieTemoin(graine);

  return {
    journal,
    avancer(nbPas_n) {
      for (let i = 0; i < nbPas_n; i++) {
        const r = pas(partie, dep);
        partie = r.partie;
        for (const trace of r.traces) journal.enregistrer(trace);
      }
    },
    instantane: () => ({
      instant_s: partie.monde.instant_s,
      pas_s: partie.pas_s,
      coureurs: partie.monde.coureurs.map((c) => ({
        id: c.id,
        s_m: c.position.s_m,
        d_m: c.position.d_m,
        vitesse_m_s: c.vitesse_m_s,
        puissance_w: c.puissanceDelivree_w,
        reserveLongue_ratio: c.energieLongue_j / c.energieLongueMax_j,
      })),
    }),
  };
}
