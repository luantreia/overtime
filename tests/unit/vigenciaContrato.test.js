import { describe, it, expect } from '@jest/globals';

/**
 * La vigencia derivada que `GET /api/jugador-equipo` agrega a cada contrato.
 *
 * `estado` y las fechas son dos ejes distintos, y confundirlos ya causó dos bugs: jugadores con
 * contrato vencido apareciendo en el plantel, y la convocatoria de entrenamientos citando gente
 * que ya no está en el equipo. Estos casos fijan la regla.
 */
const vigenciaDe = (contrato, ahora) => {
  if (contrato.estado === 'baja') return 'baja';
  if (contrato.estado !== 'aceptado') return 'pendiente';
  if (contrato.desde && new Date(contrato.desde).getTime() > ahora) return 'futuro';
  if (contrato.hasta && new Date(contrato.hasta).getTime() < ahora) return 'vencido';
  return 'vigente';
};

const HOY = new Date('2026-09-03T12:00:00.000Z').getTime();
const ct = (over) => ({ estado: 'aceptado', ...over });

describe('vigencia derivada de un contrato', () => {
  it('aceptado y dentro del período está vigente', () => {
    expect(vigenciaDe(ct({ desde: '2026-01-01', hasta: '2026-12-31' }), HOY)).toBe('vigente');
  });

  it('aceptado con `hasta` vencido NO está vigente', () => {
    // El caso que rompía todo: nadie lo dio de baja, pero el plazo se cumplió. Sigue siendo
    // 'aceptado' y no está en el equipo.
    expect(vigenciaDe(ct({ desde: '2024-01-01', hasta: '2025-06-30' }), HOY)).toBe('vencido');
  });

  it('un contrato sin `hasta` está abierto, no vencido', () => {
    expect(vigenciaDe(ct({ desde: '2020-01-01' }), HOY)).toBe('vigente');
  });

  it('un contrato que todavía no empezó es futuro, no vigente ni vencido', () => {
    // Un refuerzo que se suma el mes que viene no puede entrar hoy en una convocatoria, pero
    // tampoco corresponde mostrarlo como vencido.
    expect(vigenciaDe(ct({ desde: '2026-11-01' }), HOY)).toBe('futuro');
  });

  it('la baja explícita gana sobre cualquier fecha', () => {
    // Cortar un contrato a mitad de temporada es distinto de que se venza, y se distingue
    // aunque las fechas dijeran que todavía estaba corriendo.
    expect(vigenciaDe(ct({ estado: 'baja', desde: '2026-01-01', hasta: '2026-12-31' }), HOY)).toBe('baja');
  });

  it('lo que no está aceptado ni de baja queda pendiente', () => {
    expect(vigenciaDe(ct({ estado: 'pendiente' }), HOY)).toBe('pendiente');
  });

  it('sin fechas, un contrato aceptado está vigente', () => {
    // Datos viejos anteriores a que se cargaran fechas: no se los puede dar por vencidos.
    expect(vigenciaDe(ct({}), HOY)).toBe('vigente');
  });
});
