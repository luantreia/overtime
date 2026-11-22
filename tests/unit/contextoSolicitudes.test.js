import { describe, it, expect } from '@jest/globals';
import { idsReferenciados } from '../../src/services/contextoSolicitudes.js';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);

/**
 * Qué es `entidad` depende del tipo. Si esto se equivoca, el detalle muestra el partido o el
 * jugador equivocado: peor que no mostrar nada.
 */
describe('idsReferenciados', () => {
  it('resultadoSet: entidad es el partido', () => {
    expect(idsReferenciados({ tipo: 'resultadoSet', entidad: A, datosPropuestos: { numeroSet: 1 } }).partido).toBe(A);
  });

  it('lote de stats de un set: entidad es el set y los datos traen partido y equipo', () => {
    const r = idsReferenciados({
      tipo: 'estadisticasJugadorSet-lote',
      entidad: A,
      datosPropuestos: { setId: A, partidoId: B, equipoId: C, statIds: ['x'] },
    });
    expect(r).toMatchObject({ set: A, partido: B, equipo: C });
  });

  it('planilla: entidad es la planilla, no el partido', () => {
    const r = idsReferenciados({ tipo: 'planilla-equipo-oficializacion', entidad: A, datosPropuestos: {} });
    expect(r).toMatchObject({ planilla: A, partido: null });
  });

  it('jugador-claim: entidad es el jugador', () => {
    expect(idsReferenciados({ tipo: 'jugador-claim', entidad: A }).jugador).toBe(A);
  });

  it('un tipo que no tiene entidad mapeada no la usa como partido', () => {
    expect(idsReferenciados({ tipo: 'usuario-crear-organizacion', entidad: A, datosPropuestos: { nombre: 'x' } }))
      .toEqual({ partido: null, set: null, planilla: null, equipo: null, jugador: null, organizacion: null });
  });

  it('ignora valores que no son ObjectId', () => {
    expect(idsReferenciados({ tipo: 'resultadoSet', entidad: 'no-es-id', datosPropuestos: { equipoId: 'x' } }))
      .toMatchObject({ partido: null, equipo: null });
  });
});
