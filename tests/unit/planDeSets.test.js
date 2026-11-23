import { describe, it, expect } from '@jest/globals';
import { planDeSets, rangoDeSets } from '../../src/services/reconciliacionPlanillasService.js';

/**
 * El aviso de la reconciliación decía "los ganadores de set no se modifican desde acá" sobre
 * sets que el partido no tenía y que en realidad se creaban con el resultado de la planilla.
 */
describe('planDeSets', () => {
  const combinados = [
    { numeroSet: 1, ganadorSet: 'local' },
    { numeroSet: 2, ganadorSet: 'visitante' },
    { numeroSet: 3, ganadorSet: 'local' },
  ];

  it('partido sin sets oficiales: se crean todos, ninguno "distinto" (el caso reportado)', () => {
    const comparados = [1, 2, 3].map((n) => ({ numeroSet: n, valores: { planillaA: 'local' }, difiere: true }));
    expect(planDeSets({ setsCombinados: combinados, setsComparados: comparados })).toEqual({ crear: [1, 2, 3], distintos: [] });
  });

  it('set oficial con otro ganador: queda como distinto, no se crea', () => {
    const comparados = [
      { numeroSet: 1, valores: { oficial: 'local', planillaA: 'local' } },
      { numeroSet: 2, valores: { oficial: 'local', planillaA: 'visitante' } },
    ];
    expect(planDeSets({ setsCombinados: combinados, setsComparados: comparados })).toEqual({ crear: [3], distintos: [2] });
  });

  it('set oficial igual: ni se crea ni se avisa', () => {
    const comparados = combinados.map((s) => ({ numeroSet: s.numeroSet, valores: { oficial: s.ganadorSet } }));
    expect(planDeSets({ setsCombinados: combinados, setsComparados: comparados })).toEqual({ crear: [], distintos: [] });
  });
});

describe('rangoDeSets', () => {
  it('agrupa consecutivos', () => {
    expect(rangoDeSets([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('1 a 12');
    expect(rangoDeSets([5, 1, 2, 3])).toBe('1 a 3 y 5');
    expect(rangoDeSets([1, 2, 7])).toBe('1, 2 y 7');
    expect(rangoDeSets([4])).toBe('4');
  });
});
