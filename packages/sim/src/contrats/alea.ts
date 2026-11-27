/** Générateur aléatoire seedé, passé en paramètre à tout ce qui a besoin de hasard. */
export interface Alea {
  /** Nombre dans [0, 1). */
  suivant(): number;
}
