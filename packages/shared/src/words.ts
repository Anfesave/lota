/**
 * Filtro basico de lenguaje ofensivo para nombres de usuario y mensajes de
 * victoria. Lista deliberadamente corta y editable: no pretende ser exhaustiva,
 * solo frenar lo evidente. Ampliala segun haga falta.
 */
const BANNED_WORDS = [
  'aweonao',
  'conchetumare',
  'concha',
  'culiao',
  'culiada',
  'maricon',
  'mierda',
  'pendejo',
  'puta',
  'puto',
  'qliao',
  'verga',
  'weon',
  'zorra',
] as const;

/** Sustituciones tipo "leet" que se usan para disfrazar palabras. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Normaliza para comparar: sin tildes, sin leet, sin separadores, en minusculas. */
export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0134579@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

/** True si el texto contiene alguna palabra de la lista. */
export function containsBannedWord(text: string): boolean {
  const normalizado = normalizeForFilter(text);
  return BANNED_WORDS.some((palabra) => normalizado.includes(palabra));
}
