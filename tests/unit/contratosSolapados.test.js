import { describe, it, expect } from '@jest/globals';
import { seSolapan } from '../../src/services/contratoEquipoService.js';

/**
 * Cuándo dos contratos de un jugador con el mismo equipo se pisan.
 *
 * Es la regla que reemplaza al índice único que NO se puede poner: un jugador puede irse y
 * volver, y eso son dos contratos legítimos. Lo que está mal es tener dos que describen el
 * mismo período. Mongo no puede expresar "sin rangos solapados" como índice, así que si esta
 * función se equivoca vuelven los duplicados que rompían la convocatoria de entrenamientos.
 */
const ct = (desde, hasta) => ({ desde, hasta });

describe('solapamiento de contratos', () => {
  it('dos períodos que se cruzan se solapan', () => {
    expect(seSolapan(ct('2025-01-01', '2025-12-31'), ct('2025-06-01', '2026-06-01'))).toBe(true);
  });

  it('uno contenido dentro del otro se solapa', () => {
    expect(seSolapan(ct('2025-01-01', '2025-12-31'), ct('2025-03-01', '2025-04-01'))).toBe(true);
  });

  it('períodos consecutivos SÍ se solapan si comparten el día del borde', () => {
    // Un contrato que termina el 30/06 y otro que empieza el 30/06 comparten ese día. Es
    // ambiguo y conviene tratarlo como choque: quien lo cargó probablemente quiso 01/07.
    expect(seSolapan(ct('2025-01-01', '2025-06-30'), ct('2025-06-30', '2025-12-31'))).toBe(true);
  });

  it('el jugador que se fue y volvió NO se solapa', () => {
    // El caso legítimo que un índice único prohibiría por error.
    expect(seSolapan(ct('2023-01-01', '2023-12-31'), ct('2025-08-01', null))).toBe(false);
  });

  it('un contrato abierto se solapa con todo lo posterior', () => {
    // `hasta` vacío significa "sin fin", no "termina hoy": cualquier alta posterior choca.
    expect(seSolapan(ct('2020-01-01', null), ct('2026-01-01', '2026-12-31'))).toBe(true);
  });

  it('dos contratos abiertos siempre se solapan', () => {
    expect(seSolapan(ct('2020-01-01', null), ct('2026-01-01', null))).toBe(true);
  });

  it('un contrato sin fechas se solapa con cualquiera', () => {
    // Datos viejos sin período cargado: se los trata como "desde siempre y para siempre", que
    // es lo conservador — mejor bloquear un alta dudosa que crear un duplicado silencioso.
    expect(seSolapan(ct(null, null), ct('2026-01-01', '2026-06-01'))).toBe(true);
  });

  it('es simétrico: el orden de los argumentos no cambia el resultado', () => {
    const a = ct('2023-01-01', '2023-12-31');
    const b = ct('2025-08-01', null);
    expect(seSolapan(a, b)).toBe(seSolapan(b, a));
  });
});
