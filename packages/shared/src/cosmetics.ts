/** Tipos de cosmetico y como se ven desde el cliente. */

export const COSMETIC_TYPES = [
  'CARTON_THEME',
  'MARKER',
  'AVATAR_FRAME',
  'VICTORY_EFFECT',
  'TITLE',
] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

export const RARITIES = ['COMUN', 'RARO', 'EPICO', 'LEGENDARIO'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Datos de presentacion de cada cosmetico; su forma depende del tipo. */
export interface CosmeticData {
  /** CARTON_THEME: colores del carton. */
  fondo?: string;
  numero?: string;
  /** MARKER: color y forma de la ficha. */
  marca?: string;
  forma?: 'circulo' | 'estrella' | 'poroto' | 'tapa';
  /** AVATAR_FRAME: borde del nombre. */
  borde?: string;
  /** VICTORY_EFFECT: animacion de la pantalla de victoria. */
  efecto?: 'confeti' | 'fuegos' | 'monedas';
  /** TITLE: texto bajo el nombre. */
  texto?: string;
}

export interface CosmeticView {
  id: string;
  slug: string;
  name: string;
  type: CosmeticType;
  price: number;
  rarity: Rarity;
  data: CosmeticData;
  /** Si el usuario ya lo tiene. */
  owned: boolean;
  /** Si lo lleva puesto. */
  equipped: boolean;
}

export interface ShopView {
  coins: number;
  cosmetics: CosmeticView[];
}

/**
 * Catalogo de cosmeticos. Vive aqui, compartido, porque el servidor lo usa
 * para sembrar la tabla y el cliente para pintar colores y formas sin tener
 * que pedirlos: si estuviera solo en la base, habria que duplicarlo.
 */
export interface CosmeticSeed {
  slug: string;
  name: string;
  type: CosmeticType;
  price: number;
  rarity: Rarity;
  data: CosmeticData;
}

export const COSMETIC_CATALOG: CosmeticSeed[] = [
  // Fondo y color de los números del cartón.
  {
    slug: 'carton-clasico',
    name: 'Clásico',
    type: 'CARTON_THEME',
    price: 0,
    rarity: 'COMUN',
    data: { fondo: '#fdf6e3', numero: '#334155' },
  },
  {
    slug: 'carton-pizarra',
    name: 'Pizarra',
    type: 'CARTON_THEME',
    price: 120,
    rarity: 'COMUN',
    data: { fondo: '#1f2937', numero: '#e5e7eb' },
  },
  {
    slug: 'carton-fonda',
    name: 'Fonda dieciochera',
    type: 'CARTON_THEME',
    price: 300,
    rarity: 'RARO',
    data: { fondo: '#fef3c7', numero: '#991b1b' },
  },
  {
    slug: 'carton-neon',
    name: 'Neón',
    type: 'CARTON_THEME',
    price: 600,
    rarity: 'EPICO',
    data: { fondo: '#0f172a', numero: '#22d3ee' },
  },
  // Ficha con la que se marca.
  {
    slug: 'marca-poroto',
    name: 'Poroto',
    type: 'MARKER',
    price: 0,
    rarity: 'COMUN',
    data: { marca: '#7c2d12', forma: 'poroto' },
  },
  {
    slug: 'marca-tapa',
    name: 'Tapa de bebida',
    type: 'MARKER',
    price: 150,
    rarity: 'COMUN',
    data: { marca: '#dc2626', forma: 'tapa' },
  },
  {
    slug: 'marca-circulo',
    name: 'Círculo',
    type: 'MARKER',
    price: 150,
    rarity: 'COMUN',
    data: { marca: '#e11d48', forma: 'circulo' },
  },
  {
    slug: 'marca-estrella',
    name: 'Estrella',
    type: 'MARKER',
    price: 400,
    rarity: 'RARO',
    data: { marca: '#f59e0b', forma: 'estrella' },
  },
  // Marco del nombre en la lista de jugadores.
  {
    slug: 'marco-simple',
    name: 'Sin marco',
    type: 'AVATAR_FRAME',
    price: 0,
    rarity: 'COMUN',
    data: { borde: 'transparent' },
  },
  {
    slug: 'marco-oro',
    name: 'Marco de oro',
    type: 'AVATAR_FRAME',
    price: 500,
    rarity: 'EPICO',
    data: { borde: '#f59e0b' },
  },
  {
    slug: 'marco-cobre',
    name: 'Marco de cobre',
    type: 'AVATAR_FRAME',
    price: 250,
    rarity: 'RARO',
    data: { borde: '#b45309' },
  },
  // Animación de la pantalla de victoria.
  {
    slug: 'victoria-confeti',
    name: 'Confeti',
    type: 'VICTORY_EFFECT',
    price: 0,
    rarity: 'COMUN',
    data: { efecto: 'confeti' },
  },
  {
    slug: 'victoria-fuegos',
    name: 'Fuegos artificiales',
    type: 'VICTORY_EFFECT',
    price: 450,
    rarity: 'RARO',
    data: { efecto: 'fuegos' },
  },
  {
    slug: 'victoria-monedas',
    name: 'Lluvia de monedas',
    type: 'VICTORY_EFFECT',
    price: 800,
    rarity: 'LEGENDARIO',
    data: { efecto: 'monedas' },
  },
  // Título bajo el nombre.
  {
    slug: 'titulo-novato',
    name: 'Novato',
    type: 'TITLE',
    price: 0,
    rarity: 'COMUN',
    data: { texto: 'Novato' },
  },
  {
    slug: 'titulo-suertudo',
    name: 'Suertudo',
    type: 'TITLE',
    price: 200,
    rarity: 'COMUN',
    data: { texto: 'Suertudo' },
  },
  {
    slug: 'titulo-leyenda',
    name: 'Leyenda de la lota',
    type: 'TITLE',
    price: 1000,
    rarity: 'LEGENDARIO',
    data: { texto: 'Leyenda de la lota' },
  },
];

const POR_SLUG = new Map(COSMETIC_CATALOG.map((c) => [c.slug, c]));

/** Datos de presentacion de un cosmetico por su slug. */
export function cosmeticBySlug(slug: string | undefined): CosmeticSeed | undefined {
  return slug === undefined ? undefined : POR_SLUG.get(slug);
}

/** Datos del cosmetico equipado de un tipo, si lo hay. */
export function equippedData(
  equipped: Record<string, string>,
  type: CosmeticType,
): CosmeticData | undefined {
  return cosmeticBySlug(equipped[type])?.data;
}

/** Una partida del historial del perfil. */
export interface GameHistoryEntry {
  gameId: string;
  playedAt: string;
  players: number;
  result: 'WIN_FULL' | 'WIN_LINE' | 'NONE';
  coinsWon: number;
  bet: number;
  potWon: number;
}
