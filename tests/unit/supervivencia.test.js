import { lineaDeTiempo, vivosPorLado, estadisticasDesdeEventos, estaVivo } from '../../src/utils/supervivencia.js';

// Set de 3 contra 3: A = a1,a2,a3 · B = b1,b2,b3
const jugadores = [
  { id: 'a1', lado: 'A' }, { id: 'a2', lado: 'A' }, { id: 'a3', lado: 'A' },
  { id: 'b1', lado: 'B' }, { id: 'b2', lado: 'B' }, { id: 'b3', lado: 'B' },
];
const eventos = [
  { t: 10, tipo: 'out', jugador: 'a1', motivo: 'hit', por: 'b1' },
  { t: 20, tipo: 'out', jugador: 'b2', motivo: 'catch', por: 'a2' },
  { t: 21, tipo: 'reingreso', jugador: 'a1' }, // vuelve por el catch de a2
  { t: 30, tipo: 'out', jugador: 'b1', motivo: 'linea' },
  { t: 40, tipo: 'out', jugador: 'b3', motivo: 'hit', por: 'a3' },
];

describe('supervivencia', () => {
  it('arma los tramos en cancha de cada jugador', () => {
    const filas = lineaDeTiempo(jugadores, eventos, 0);
    expect(filas.find((f) => f.id === 'a1').tramos).toEqual([[0, 10], [21, null]]);
    expect(filas.find((f) => f.id === 'b1').tramos).toEqual([[0, 30]]);
  });

  it('cuenta los vivos por lado en cada instante', () => {
    const filas = lineaDeTiempo(jugadores, eventos, 0);
    expect(vivosPorLado(filas, 5)).toEqual({ A: 3, B: 3 });
    expect(vivosPorLado(filas, 15)).toEqual({ A: 2, B: 3 });
    expect(vivosPorLado(filas, 25)).toEqual({ A: 3, B: 2 });
    expect(vivosPorLado(filas, 45)).toEqual({ A: 3, B: 0 });
  });

  it('deriva outs, hits, catches, reingresos y sobrevivientes', () => {
    const s = estadisticasDesdeEventos(jugadores, eventos, { inicio: 0, fin: 41 });
    expect(s.get('a1')).toMatchObject({ outs: 1, reingresos: 1, sobrevive: true });
    expect(s.get('a2')).toMatchObject({ catches: 1, outs: 0, sobrevive: true });
    expect(s.get('a3')).toMatchObject({ hits: 1, sobrevive: true });
    expect(s.get('b1')).toMatchObject({ hits: 1, outs: 1, sobrevive: false });
    expect(s.get('b1').outsPorMotivo.linea).toBe(1);
  });

  it('un cambio saca a uno y mete a otro en el mismo lado', () => {
    const filas = lineaDeTiempo(jugadores, [{ t: 5, tipo: 'cambio', jugador: 'a1', entra: 'a9' }], 0);
    const entra = filas.find((f) => f.id === 'a9');
    expect(entra).toMatchObject({ lado: 'A', entra: true });
    expect(estaVivo(filas.find((f) => f.id === 'a1'), 6)).toBe(false);
    expect(vivosPorLado(filas, 6)).toEqual({ A: 3, B: 3 });
  });

  it('ignora marcas de jugadores fuera de la alineación', () => {
    const filas = lineaDeTiempo(jugadores, [{ t: 5, tipo: 'out', jugador: 'zz', motivo: 'hit' }], 0);
    expect(vivosPorLado(filas, 6)).toEqual({ A: 3, B: 3 });
  });
});
