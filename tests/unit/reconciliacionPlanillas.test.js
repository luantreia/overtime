import { describe, it, expect } from '@jest/globals';
import {
  fuenteDesdePlanilla,
  compararFuentes,
  combinarFuentes,
  FUENTE_OFICIAL,
} from '../../src/services/reconciliacionPlanillasService.js';

/**
 * Comparación y combinación de fuentes para la reconciliación de un partido.
 * Escenario base: LOCAL y VISITA; cada equipo cargó su planilla en modo sets, con sus
 * jugadores y además algún rival.
 */
const LOCAL = 'eqL';
const VISITA = 'eqV';

const planilla = ({ id, equipo, modo = 'sets', presentes, sets = [], estadisticas }) => ({
  _id: id, equipo, modo, estado: 'pendiente_oficializacion', presentes, sets, estadisticas,
});
const fila = (presente, set, n) => ({ planillaPresente: presente, planillaSet: set, throws: n, hits: n, outs: 0, catches: 0 });

const deLocal = planilla({
  id: 'plL',
  equipo: LOCAL,
  presentes: [
    { _id: 'a', jugador: 'j1', equipo: LOCAL },
    { _id: 'b', jugador: 'j2', equipo: LOCAL },
    { _id: 'c', jugador: 'j9', equipo: VISITA }, // capturó también a un rival
  ],
  sets: [{ _id: 's1', numeroSet: 1, ganadorSet: 'local' }, { _id: 's2', numeroSet: 2, ganadorSet: 'visitante' }],
  estadisticas: [fila('a', 's1', 2), fila('a', 's2', 1), fila('b', 's1', 4), fila('c', 's1', 7)],
});

const deVisita = planilla({
  id: 'plV',
  equipo: VISITA,
  presentes: [{ _id: 'x', jugador: 'j9', equipo: VISITA }, { _id: 'y', jugador: 'j1', equipo: LOCAL }],
  sets: [{ _id: 't1', numeroSet: 1, ganadorSet: 'visitante' }],
  estadisticas: [fila('x', 't1', 5), fila('y', 't1', 3)],
});

describe('fuenteDesdePlanilla', () => {
  it('suma todos los sets por jugador y conserva el equipo de cada presente', () => {
    const f = fuenteDesdePlanilla(deLocal);
    expect(f.porJugador.j1.totales).toEqual({ throws: 3, hits: 3, outs: 0, catches: 0 });
    expect(f.porJugador.j9.equipo).toBe(VISITA);
    expect(f.sets).toEqual({ 1: 'local', 2: 'visitante' });
  });

  it('un presente viejo sin equipo cae al dueño de la planilla', () => {
    const vieja = planilla({ id: 'p', equipo: LOCAL, presentes: [{ _id: 'a', jugador: 'j1' }], estadisticas: [] });
    expect(fuenteDesdePlanilla(vieja).porJugador.j1.equipo).toBe(LOCAL);
  });
});

describe('compararFuentes', () => {
  const oficial = { id: FUENTE_OFICIAL, porJugador: {}, sets: {} };
  const { jugadores, sets, hayDiferencias } = compararFuentes({
    fuentes: [oficial, fuenteDesdePlanilla(deLocal), fuenteDesdePlanilla(deVisita)],
  });
  const de = (j) => jugadores.find((f) => f.jugador === j);

  it('marca diferencia cuando dos fuentes dan totales distintos', () => {
    expect(de('j9').valores).toMatchObject({ plL: { throws: 7 }, plV: { throws: 5 } });
    expect(de('j9').difiere).toBe(true);
  });

  it('marca dónde falta cada jugador', () => {
    expect(de('j2').ausenteEn).toEqual([FUENTE_OFICIAL, 'plV']);
    expect(de('j2').difiere).toBe(true);
  });

  it('compara ganadores de set y marca los que no coinciden o faltan', () => {
    expect(sets).toEqual([
      { numeroSet: 1, valores: { plL: 'local', plV: 'visitante' }, difiere: true },
      { numeroSet: 2, valores: { plL: 'visitante' }, difiere: true },
    ]);
    expect(hayDiferencias).toBe(true);
  });

  it('una planilla de totales no cuenta para comparar sets', () => {
    const oficialConSet = { id: FUENTE_OFICIAL, modo: 'sets', porJugador: {}, sets: { 1: 'local' } };
    const directa = { ...fuenteDesdePlanilla({ ...deVisita, id: 'plD', modo: 'directa' }), id: 'plD' };
    const r = compararFuentes({ fuentes: [oficialConSet, directa] });
    expect(r.sets).toEqual([{ numeroSet: 1, valores: { [FUENTE_OFICIAL]: 'local' }, difiere: false }]);
  });

  it('dos fuentes iguales no difieren', () => {
    const r = compararFuentes({ fuentes: [fuenteDesdePlanilla(deLocal), { ...fuenteDesdePlanilla(deLocal), id: 'copia' }] });
    expect(r.hayDiferencias).toBe(false);
  });
});

describe('combinarFuentes', () => {
  const planillasPorId = { plL: deLocal, plV: deVisita };

  it('toma de cada planilla sólo los jugadores del equipo para el que se eligió', () => {
    const r = combinarFuentes({ fuentePorEquipo: { [LOCAL]: 'plL', [VISITA]: 'plV' }, planillasPorId });
    const porJugador = Object.fromEntries(r.presentes.map((p) => [p.jugador, p.equipo]));
    expect(porJugador).toEqual({ j1: LOCAL, j2: LOCAL, j9: VISITA });
    // j9 sale de la planilla del visitante (5), no de la captura que hizo el local (7).
    const claveJ9 = r.presentes.find((p) => p.jugador === 'j9').clave;
    expect(r.estadisticas.filter((e) => e.presente === claveJ9).map((e) => e.throws)).toEqual([5]);
    expect(r.modo).toBe('sets');
  });

  it("un equipo en 'oficial' no aporta filas", () => {
    const r = combinarFuentes({ fuentePorEquipo: { [LOCAL]: 'plL', [VISITA]: FUENTE_OFICIAL }, planillasPorId });
    expect(r.presentes.every((p) => p.equipo === LOCAL)).toBe(true);
    expect(r.equiposAplicados).toEqual([LOCAL]);
  });

  it('una misma planilla puede ser la fuente de los dos equipos', () => {
    const r = combinarFuentes({ fuentePorEquipo: { [LOCAL]: 'plL', [VISITA]: 'plL' }, planillasPorId });
    expect(r.presentes.map((p) => p.jugador).sort()).toEqual(['j1', 'j2', 'j9']);
  });

  it('si alguna fuente elegida es directa, todo se combina en totales', () => {
    const directa = planilla({
      id: 'plD', equipo: VISITA, modo: 'directa',
      presentes: [{ _id: 'z', jugador: 'j9', equipo: VISITA }],
      estadisticas: [fila('z', null, 6)],
    });
    const r = combinarFuentes({ fuentePorEquipo: { [LOCAL]: 'plL', [VISITA]: 'plD' }, planillasPorId: { ...planillasPorId, plD: directa } });
    expect(r.modo).toBe('directa');
    expect(r.sets).toEqual([]);
    const claveJ1 = r.presentes.find((p) => p.jugador === 'j1').clave;
    expect(r.estadisticas.filter((e) => e.presente === claveJ1)).toEqual([
      { presente: claveJ1, numeroSet: null, throws: 3, hits: 3, outs: 0, catches: 0, survive: false },
    ]);
  });

  it('en modo sets conserva los sets de las fuentes, sin duplicar números', () => {
    const r = combinarFuentes({ fuentePorEquipo: { [LOCAL]: 'plL', [VISITA]: 'plV' }, planillasPorId });
    expect(r.sets.map((s) => s.numeroSet)).toEqual([1, 2]);
  });
});
