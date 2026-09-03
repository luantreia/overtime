import { describe, it, expect } from '@jest/globals';

/**
 * Si un cambio en un test es una mejora o un retroceso.
 *
 * Es la única regla de todo el módulo de tests que se puede escribir mal sin que nadie lo note:
 * el resultado es una flecha verde o roja, y una flecha verde sobre un empeoramiento no rompe
 * nada, sólo miente. Por eso la decisión vive en el servidor y no en cada cliente.
 */
const evaluarProgreso = ({ mediciones, mejorEs }) => {
  if (mediciones.length < 2) return null;
  const delta = mediciones[mediciones.length - 1] - mediciones[0];
  if (delta === 0 || mejorEs === 'neutro') return null;
  return mejorEs === 'menor' ? delta < 0 : delta > 0;
};

describe('dirección del progreso en un test', () => {
  it('en un test de "mayor es mejor", subir es mejorar', () => {
    // Salto vertical: de 38 a 44 cm.
    expect(evaluarProgreso({ mediciones: [38, 44], mejorEs: 'mayor' })).toBe(true);
    expect(evaluarProgreso({ mediciones: [44, 38], mejorEs: 'mayor' })).toBe(false);
  });

  it('en un test de tiempo, BAJAR es mejorar', () => {
    // Sprint de 10 m: de 2.1 a 1.9 segundos. Es el caso que se escribe mal por defecto, porque
    // el instinto es "número más grande = mejor".
    expect(evaluarProgreso({ mediciones: [2.1, 1.9], mejorEs: 'menor' })).toBe(true);
    expect(evaluarProgreso({ mediciones: [1.9, 2.1], mejorEs: 'menor' })).toBe(false);
  });

  it('lo neutro no se juzga', () => {
    // El peso se registra, no se aprueba ni se reprueba. Poner una flecha roja sobre el peso de
    // un jugador es una opinión que el sistema no tiene por qué tener.
    expect(evaluarProgreso({ mediciones: [72, 78], mejorEs: 'neutro' })).toBeNull();
    expect(evaluarProgreso({ mediciones: [78, 72], mejorEs: 'neutro' })).toBeNull();
  });

  it('con una sola medición no hay progreso que mostrar', () => {
    // Un valor suelto no es una tendencia. Compararlo contra sí mismo daría "sin cambios",
    // que sugiere que se midió dos veces.
    expect(evaluarProgreso({ mediciones: [40], mejorEs: 'mayor' })).toBeNull();
  });

  it('sin cambio no hay flecha', () => {
    expect(evaluarProgreso({ mediciones: [40, 42, 40], mejorEs: 'mayor' })).toBeNull();
  });

  it('compara la primera contra la última, no contra la anterior', () => {
    // Interesa el recorrido de la pretemporada entera, no si esta semana estuvo peor que la
    // pasada: un bajón puntual no borra tres meses de mejora.
    expect(evaluarProgreso({ mediciones: [38, 45, 43], mejorEs: 'mayor' })).toBe(true);
  });
});
