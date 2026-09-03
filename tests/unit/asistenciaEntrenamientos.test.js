import { describe, it, expect } from '@jest/globals';

/**
 * El porcentaje de asistencia de `GET /api/entrenamientos/resumen`.
 *
 * La fórmula parece trivial y no lo es: lo que decide si el número sirve o no es qué se deja
 * FUERA del denominador. Se replica acá porque probar la ruta entera pediría Express y Mongo,
 * y lo que tiene lógica es exactamente esto.
 */
const calcular = (j) => {
  const asistio = j.presente + j.tarde;
  const computables = asistio + j.ausente;
  return computables > 0 ? asistio / computables : null;
};

const jugador = (over = {}) => ({
  presente: 0,
  tarde: 0,
  ausente: 0,
  justificado: 0,
  convocado: 0,
  ...over,
});

describe('porcentaje de asistencia a entrenamientos', () => {
  it('cuenta llegar tarde como haber ido', () => {
    // Llegar tarde es un problema de puntualidad, no de ausentismo. Mezclarlos escondería a
    // quien va siempre y llega tarde detrás del mismo número que quien no va.
    expect(calcular(jugador({ presente: 6, tarde: 2, ausente: 2 }))).toBe(0.8);
  });

  it('el justificado no cuenta como falta ni como presencia', () => {
    const conJustificados = jugador({ presente: 5, ausente: 5, justificado: 10 });
    const sinJustificados = jugador({ presente: 5, ausente: 5 });
    // Un jugador lesionado cuatro semanas no tiene por qué arrastrar un número que después se
    // lee como desinterés: los justificados salen del denominador.
    expect(calcular(conJustificados)).toBe(calcular(sinJustificados));
    expect(calcular(conJustificados)).toBe(0.5);
  });

  it('lo que nadie marcó tampoco cuenta', () => {
    // `convocado` es "todavía no lo marqué", no "faltó". Un entrenamiento cuya asistencia el DT
    // se olvidó de cargar no puede hundirle el porcentaje a todo el plantel.
    expect(calcular(jugador({ presente: 3, convocado: 7 }))).toBe(1);
  });

  it('sin entrenamientos computables devuelve null, no cero', () => {
    // Cero por ciento es una afirmación fuerte: dice que el jugador no fue nunca. Sin datos hay
    // que decir "no sé", que en la UI se muestra como un guion.
    expect(calcular(jugador())).toBeNull();
    expect(calcular(jugador({ justificado: 5, convocado: 2 }))).toBeNull();
  });

  it('asistencia perfecta es 1 y ausencia total es 0', () => {
    expect(calcular(jugador({ presente: 10 }))).toBe(1);
    expect(calcular(jugador({ ausente: 10 }))).toBe(0);
  });
});
