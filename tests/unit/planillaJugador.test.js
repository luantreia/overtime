import { describe, it, expect } from '@jest/globals';
import {
  contratoVigenteEn,
  equipoDelJugadorEnPartido,
  normalizarNumeros,
} from '../../src/services/planillaJugadorService.js';

/** Reglas puras de "mis números": de qué equipo jugó, y qué números se aceptan. */
const partido = { fecha: '2026-06-15', equipoLocal: 'L', equipoVisitante: 'V' };
const ct = (equipo, over = {}) => ({ equipo, estado: 'aceptado', ...over });

describe('contratoVigenteEn', () => {
  it('aceptado sin fechas está vigente', () => {
    expect(contratoVigenteEn(ct('L'), '2026-06-15')).toBe(true);
  });
  it('baja no está vigente aunque las fechas cubran', () => {
    expect(contratoVigenteEn(ct('L', { estado: 'baja' }), '2026-06-15')).toBe(false);
  });
  it('fuera del período no está vigente', () => {
    expect(contratoVigenteEn(ct('L', { hasta: '2026-01-01' }), '2026-06-15')).toBe(false);
    expect(contratoVigenteEn(ct('L', { desde: '2026-07-01' }), '2026-06-15')).toBe(false);
  });
});

describe('equipoDelJugadorEnPartido', () => {
  it('devuelve el lado con contrato vigente a la fecha', () => {
    expect(equipoDelJugadorEnPartido(partido, [ct('V')])).toBe('V');
  });
  it('un contrato vencido con el local no cuenta: jugó para el visitante', () => {
    expect(equipoDelJugadorEnPartido(partido, [ct('L', { hasta: '2026-03-01' }), ct('V', { desde: '2026-03-02' })])).toBe('V');
  });
  it('sin contrato con ninguno de los dos, null', () => {
    expect(equipoDelJugadorEnPartido(partido, [ct('OTRO')])).toBeNull();
  });
  it('acepta equipos populados', () => {
    expect(equipoDelJugadorEnPartido({ ...partido, equipoLocal: { _id: 'L' } }, [ct({ _id: 'L' })])).toBe('L');
  });
});

describe('normalizarNumeros', () => {
  it('completa con cero lo que falta', () => {
    expect(normalizarNumeros({ hits: 3 })).toEqual({ ok: true, numeros: { throws: 0, hits: 3, outs: 0, catches: 0 } });
  });
  it('acepta strings numéricos (inputs de formulario)', () => {
    expect(normalizarNumeros({ throws: '7' }).numeros.throws).toBe(7);
  });
  it('rechaza negativos, decimales y basura', () => {
    expect(normalizarNumeros({ hits: -1 }).ok).toBe(false);
    expect(normalizarNumeros({ hits: 1.5 }).ok).toBe(false);
    expect(normalizarNumeros({ hits: 'muchos' }).ok).toBe(false);
  });
});
