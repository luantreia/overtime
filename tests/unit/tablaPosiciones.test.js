import { describe, it, expect } from '@jest/globals';

/**
 * El ordenamiento de la tabla de posiciones que devuelve `GET /api/fases/:id/tabla`.
 *
 * Se replica acá la comparación en vez de importar la ruta porque probar la ruta entera pide
 * levantar Express y Mongo. Lo que tiene lógica de verdad es este criterio, y en particular el
 * tratamiento de `posicion: null`, que es el caso que se rompe solo: una fase que la
 * organización nunca recalculó tiene TODAS las posiciones en null, y si null se ordenara como
 * cero, la tabla saldría invertida y parecería un ranking real.
 */
const ordenar = (filas) =>
  [...filas].sort((a, b) => {
    if (a.posicion !== null && b.posicion !== null && a.posicion !== b.posicion) {
      return a.posicion - b.posicion;
    }
    if (a.posicion === null && b.posicion !== null) return 1;
    if (b.posicion === null && a.posicion !== null) return -1;
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    return b.diferenciaPuntos - a.diferenciaPuntos;
  });

const fila = (nombre, posicion, puntos, diferenciaPuntos = 0) => ({
  nombre,
  posicion,
  puntos,
  diferenciaPuntos,
});

const nombres = (filas) => ordenar(filas).map((f) => f.nombre);

describe('orden de la tabla de posiciones', () => {
  it('respeta la posición ya calculada por la organización', () => {
    const filas = [fila('C', 3, 9), fila('A', 1, 4), fila('B', 2, 7)];
    // Se respeta `posicion` aunque los puntos digan otra cosa: la organización ya aplicó sus
    // criterios de desempate y el panel no los vuelve a inventar.
    expect(nombres(filas)).toEqual(['A', 'B', 'C']);
  });

  it('sin posiciones calculadas ordena por puntos y después por diferencia', () => {
    const filas = [
      fila('Bajo', null, 3, 10),
      fila('Alto', null, 9, -5),
      fila('Medio empatado peor', null, 6, 1),
      fila('Medio empatado mejor', null, 6, 8),
    ];
    expect(nombres(filas)).toEqual([
      'Alto',
      'Medio empatado mejor',
      'Medio empatado peor',
      'Bajo',
    ]);
  });

  it('los equipos sin posición van al final, no al principio', () => {
    // Un equipo agregado a la fase después del último recálculo tiene posicion null. Tratar
    // null como 0 lo pondría primero, que es exactamente lo contrario de la verdad.
    const filas = [fila('Sin recalcular', null, 12), fila('Segundo', 2, 3), fila('Primero', 1, 6)];
    expect(nombres(filas)).toEqual(['Primero', 'Segundo', 'Sin recalcular']);
  });

  it('no altera el arreglo original', () => {
    const filas = [fila('B', 2, 0), fila('A', 1, 0)];
    ordenar(filas);
    expect(filas.map((f) => f.nombre)).toEqual(['B', 'A']);
  });
});
