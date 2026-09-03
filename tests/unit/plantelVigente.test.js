import { describe, it, expect } from '@jest/globals';
import { vigenteEn } from '../../src/services/jugadoresElegiblesService.js';

/**
 * Quién entra en la convocatoria de un entrenamiento.
 *
 * Dos reglas, y las dos causaron un bug real:
 *
 * - Filtrar por fecha. `estado: 'aceptado'` no alcanza: un contrato que terminó sigue aceptado,
 *   así que la convocatoria traía jugadores que ya no están en el equipo.
 * - Deduplicar por jugador. `JugadorEquipo` no tiene índice único {jugador, equipo}, o sea que
 *   alguien que se fue y volvió tiene DOS contratos. El `insertMany` de la convocatoria chocaba
 *   contra el índice único {entrenamiento, jugador} y la creación entera devolvía 500.
 */
const plantelVigenteEn = (contratos, fecha) => {
  const vigentes = contratos.filter((c) => vigenteEn(c, fecha));
  return [...new Set(vigentes.map((c) => String(c.jugador)))];
};

const dia = (iso) => new Date(iso);

describe('plantel vigente a una fecha', () => {
  it('deja afuera los contratos que ya terminaron', () => {
    const contratos = [
      { jugador: 'activo', desde: dia('2025-01-01') },
      { jugador: 'se-fue', desde: dia('2024-01-01'), hasta: dia('2025-06-30') },
    ];
    expect(plantelVigenteEn(contratos, dia('2026-03-01'))).toEqual(['activo']);
  });

  it('deja afuera los contratos que todavía no empezaron', () => {
    const contratos = [
      { jugador: 'actual', desde: dia('2025-01-01') },
      { jugador: 'refuerzo', desde: dia('2026-07-01') },
    ];
    expect(plantelVigenteEn(contratos, dia('2026-03-01'))).toEqual(['actual']);
  });

  it('un contrato sin `hasta` está abierto, no vencido', () => {
    const contratos = [{ jugador: 'indefinido', desde: dia('2020-01-01') }];
    expect(plantelVigenteEn(contratos, dia('2026-03-01'))).toEqual(['indefinido']);
  });

  it('deduplica al jugador que se fue y volvió', () => {
    // Este es el caso que rompía la creación con un 500: dos contratos aceptados del mismo
    // jugador producían dos filas de asistencia y el índice único las rechazaba.
    const contratos = [
      { jugador: 'volvio', desde: dia('2023-01-01'), hasta: dia('2024-06-30') },
      { jugador: 'volvio', desde: dia('2025-08-01') },
    ];
    expect(plantelVigenteEn(contratos, dia('2026-03-01'))).toEqual(['volvio']);
  });

  it('la referencia es la fecha del entrenamiento, no la de hoy', () => {
    const contratos = [
      { jugador: 'estuvo-en-enero', desde: dia('2024-01-01'), hasta: dia('2025-12-31') },
      { jugador: 'llego-despues', desde: dia('2026-02-01') },
    ];
    // Cargar hoy la asistencia de un entrenamiento viejo tiene que convocar al plantel de
    // ENTONCES: quien todavía no había llegado no pudo haber ido.
    expect(plantelVigenteEn(contratos, dia('2025-03-01'))).toEqual(['estuvo-en-enero']);
    expect(plantelVigenteEn(contratos, dia('2026-03-01'))).toEqual(['llego-despues']);
  });
});
