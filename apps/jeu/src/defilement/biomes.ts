// Biomes du décor (UF 2.7), repris de l'archive (palettes de `scenery.ts`, v0.1.2) et revérifiés avec la route actuelle.
import type { TypeEtape } from '@pedale/sim';

export type CleBiome = 'prairie' | 'desert' | 'automne' | 'montagne';
export type ChoixBiome = CleBiome | 'auto';
export const CLES_BIOME: readonly CleBiome[] = ['prairie', 'desert', 'automne', 'montagne'];

export interface Biome {
  readonly nom: string;
  /** Couleur du sol, taches douces, accotement (bas-côté dur), bande d'herbe qui borde l'accotement. */
  readonly base: string;
  readonly taches: readonly string[];
  readonly accotement: string;
  readonly herbeBord: string;
  readonly lac: boolean;
  readonly eau: string;
  readonly rive: string;
  /** Couples [ombre, lumière] pour les arbres et buissons. */
  readonly arbres: readonly (readonly [string, string])[];
  readonly champs: readonly string[];
  readonly sillons: boolean;
  readonly toits: readonly string[];
  readonly mur: string;
  /** Éléments épars : 'buisson' | 'rocher' | 'foin' | 'cactus'. */
  readonly extras: readonly ('buisson' | 'rocher' | 'foin' | 'cactus')[];
  /** Densité des bosquets (1 = normale). */
  readonly foret: number;
  readonly toitPlat: boolean;
  readonly allees: boolean;
}

export const BIOMES: Readonly<Record<CleBiome, Biome>> = {
  prairie: {
    nom: 'Prairie', base: '#94ae63', taches: ['#7f9b55', '#a8bd74', '#c5b985', '#86a45a'], accotement: '#cdbf98', herbeBord: '#a3bb6c', lac: true,
    eau: '#5fb6ad', rive: '#e6d9aa', arbres: [['#3f6e35', '#5d8f45'], ['#4b7a3a', '#6b9c4b'], ['#35603a', '#4f8546']],
    champs: ['#a9bd6a', '#c9c06b', '#7fa25b', '#d5b86a', '#b5c77a'], sillons: true, toits: ['#c8553d', '#b8472f', '#d4793f', '#8c4a3b'], mur: '#efe6d2',
    extras: ['buisson', 'rocher', 'foin'], foret: 1, toitPlat: false, allees: true,
  },
  desert: {
    nom: 'Désert', base: '#d9a863', taches: ['#cf9a56', '#e6bb7c', '#c78848', '#e2b36e'], accotement: '#ecd3a0', herbeBord: '#d9ad6c', lac: false,
    eau: '#5fb6ad', rive: '#e6d9aa', arbres: [['#7a8a3e', '#9aa653']], champs: [], sillons: false, toits: ['#e9d4a6', '#dcc08a', '#f0e0bb'], mur: '#f1deb4',
    extras: ['cactus', 'rocher', 'buisson', 'buisson'], foret: 0.3, toitPlat: true, allees: false,
  },
  montagne: {
    nom: 'Montagne', base: '#8a9a6e', taches: ['#7a8b62', '#9aa883', '#a39f8e', '#6f8260'], accotement: '#c4bba3', herbeBord: '#8fa070', lac: false,
    eau: '#6aa6b4', rive: '#cfc7ad', arbres: [['#2f5a3a', '#44744a'], ['#264d35', '#3b6844'], ['#3a6a40', '#55854f']],
    champs: [], sillons: false, toits: ['#8a5a44', '#6f4a3a', '#a06a4a'], mur: '#e6dcc4', extras: ['rocher', 'rocher', 'buisson'], foret: 0.8, toitPlat: false, allees: true,
  },
  automne: {
    nom: 'Automne', base: '#a9a55c', taches: ['#928f48', '#bdb26a', '#b08a4a', '#9a9a50'], accotement: '#cdb98f', herbeBord: '#b2ab62', lac: true,
    eau: '#4f9aa6', rive: '#d9c796', arbres: [['#b9552a', '#dc7f35'], ['#c88a2e', '#e8b43f'], ['#9b3d27', '#c25a33'], ['#667a35', '#8a9d45']],
    champs: ['#c9a54d', '#b8873f', '#a8a85a', '#d1b85a'], sillons: true, toits: ['#a5432e', '#7b4a3a', '#c06a3c'], mur: '#ece0c6',
    extras: ['buisson', 'rocher', 'foin'], foret: 1, toitPlat: false, allees: true,
  },
};

/** Biome choisi automatiquement selon le type d'étape (comme à la v0.0.6 : plaine → prairie, vallonné → automne, montagne → montagne). */
export const biomeAuto = (type: TypeEtape): CleBiome => (type === 'plaine' ? 'prairie' : type === 'vallonne' ? 'automne' : 'montagne');
export const biomeEffectif = (choix: ChoixBiome, type: TypeEtape): CleBiome => (choix === 'auto' ? biomeAuto(type) : choix);

/** Couleurs des vêtements, cheveux et peaux des spectateurs. */
export const HABITS = ['#e63946', '#2a6fdb', '#f4c20d', '#ffffff', '#2fa84f', '#ff7a1a', '#7b4bd6', '#ff6fae', '#222222', '#19b6c9', '#8a5a44', '#5a7d9a'] as const;
export const PEAUX = ['#f1c9a5', '#d9a67c', '#a56e49', '#7a4a2e', '#f6d9c0'] as const;
export const PORTIQUE_ARRIVEE = ['#e4572e', '#f2f0e6', '#2a6fdb', '#f4c20d', '#e4572e', '#f2f0e6', '#2fa84f', '#f4c20d'] as const;
export const PORTIQUE_FLAMME = ['#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6'] as const;
/** Direction des ombres dans le monde (le soleil est au nord-ouest : les ombres tombent vers le sud-est, comme dans l'archive). */
export const OMBRE = { x: 0.55, y: -0.83 } as const;
