/** Casilla de un carton: un numero del bolillero o un hueco. */
export type Cell = number | null;

/**
 * Carton de lota chilena: 3 filas x 9 columnas con 15 numeros, 5 por fila.
 * Se serializa tal cual a JSON para mandarlo al cliente y para guardarlo en
 * `game_players.cards`.
 */
export type Card = Cell[][];
