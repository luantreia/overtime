import { segundoDesdeHora, segundoParaAlinear } from '../../src/services/relojEnVivoService.js';

describe('reloj en vivo', () => {
  const ancla = new Date('2026-11-24T15:30:00Z');
  it('cuenta segundos reales desde el ancla, pausas incluidas', () => {
    expect(segundoDesdeHora({ ancla, segundo: 0 }, new Date('2026-11-24T15:38:00Z'))).toBe(480);
  });
  it('alinear con un punto corre todas las marcas lo mismo', () => {
    const hora = new Date('2026-11-24T15:38:00Z');
    const segundo = segundoParaAlinear({ ancla, segundo: 0 }, hora, 492);
    expect(segundo).toBe(12);
    expect(segundoDesdeHora({ ancla, segundo }, hora)).toBe(492);
    expect(segundoDesdeHora({ ancla, segundo }, ancla)).toBe(12);
  });
});
