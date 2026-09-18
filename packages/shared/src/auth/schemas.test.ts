import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, usernameSchema, victoryMessageSchema } from './schemas.js';
import { containsBannedWord, normalizeForFilter } from '../words.js';

const VALIDO = { username: 'don_pepe', password: 'unaClaveLarga1', victoryMessage: '¡Me gane!' };

describe('registerSchema', () => {
  it('acepta un registro valido', () => {
    expect(registerSchema.safeParse(VALIDO).success).toBe(true);
  });

  it('recorta los espacios del nombre y del mensaje', () => {
    const parsed = registerSchema.parse({ ...VALIDO, username: '  don_pepe  ' });
    expect(parsed.username).toBe('don_pepe');
  });

  it.each([
    ['muy corto', 'ab'],
    ['muy largo', 'a'.repeat(21)],
    ['con espacio', 'don pepe'],
    ['con guion', 'don-pepe'],
    ['con acento', 'peñi'],
    ['vacio', ''],
  ])('rechaza un nombre %s', (_caso, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false);
  });

  it('rechaza contrasenas de menos de 8 caracteres', () => {
    expect(registerSchema.safeParse({ ...VALIDO, password: '1234567' }).success).toBe(false);
  });

  it('rechaza contrasenas de mas de 72 caracteres', () => {
    // argon2 ignora los bytes que pasan de 72: aceptarlas daria falsa seguridad.
    expect(registerSchema.safeParse({ ...VALIDO, password: 'a'.repeat(73) }).success).toBe(false);
  });

  it('rechaza mensajes de victoria de mas de 140 caracteres', () => {
    expect(victoryMessageSchema.safeParse('a'.repeat(141)).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('no aplica reglas de formato, solo exige que vengan los campos', () => {
    // Un usuario registrado antes de endurecer las reglas debe poder entrar.
    expect(loginSchema.safeParse({ username: 'ab', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
  });
});

describe('filtro de palabras', () => {
  it('normaliza tildes, leet y separadores', () => {
    expect(normalizeForFilter('W-E_0.N')).toBe('weon');
  });

  it('detecta palabras disfrazadas', () => {
    expect(containsBannedWord('w3on')).toBe(true);
    expect(containsBannedWord('Cul14o')).toBe(true);
  });

  it('no marca texto inofensivo', () => {
    expect(containsBannedWord('don_pepe')).toBe(false);
    expect(containsBannedWord('¡Gane la lota!')).toBe(false);
  });

  it('bloquea nombres y mensajes ofensivos', () => {
    expect(usernameSchema.safeParse('el_weon').success).toBe(false);
    expect(victoryMessageSchema.safeParse('gane, culiao').success).toBe(false);
  });
});
