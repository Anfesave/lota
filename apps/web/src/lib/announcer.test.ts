import { describe, expect, it } from 'vitest';
import { elegirVoz } from './announcer.js';

/** Voz de mentira, solo con lo que mira `elegirVoz`. */
function voz(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name } as SpeechSynthesisVoice;
}

describe('elección de voz de la locutora', () => {
  it('prefiere la chilena por encima de todo', () => {
    const voces = [voz('es-ES'), voz('es-MX'), voz('es-CL'), voz('en-US')];
    expect(elegirVoz(voces)?.lang).toBe('es-CL');
  });

  it('si no hay chilena, toma otra latinoamericana antes que la de España', () => {
    // Es el caso importante: el acento peninsular se nota mucho cantando números.
    expect(elegirVoz([voz('es-ES'), voz('es-MX')])?.lang).toBe('es-MX');
    expect(elegirVoz([voz('es-ES'), voz('es-419')])?.lang).toBe('es-419');
    expect(elegirVoz([voz('es-ES'), voz('es-AR')])?.lang).toBe('es-AR');
  });

  it('una latinoamericana fuera de la lista también gana a la de España', () => {
    expect(elegirVoz([voz('es-ES'), voz('es-PA')])?.lang).toBe('es-PA');
  });

  it('acepta el guion bajo y las mayúsculas que usan algunos sistemas', () => {
    expect(elegirVoz([voz('es_ES'), voz('ES_CL')])?.lang).toBe('ES_CL');
  });

  it('con solo la de España, se usa esa', () => {
    // No se puede instalar voces desde el navegador: si es la única, es la que hay.
    expect(elegirVoz([voz('es-ES'), voz('en-US')])?.lang).toBe('es-ES');
  });

  it('sin ninguna voz en español no devuelve nada', () => {
    expect(elegirVoz([voz('en-US'), voz('pt-BR')])).toBeUndefined();
    expect(elegirVoz([])).toBeUndefined();
  });
});
