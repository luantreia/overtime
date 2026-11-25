import { describe, it, expect } from '@jest/globals';
import { seleccionPlanilla, seleccionLote, seleccionCamposContrato, seleccionSegunAlcance, normalizarAlcance } from '../../src/utils/seleccionAprobacion.js';

const planilla = {
  presentes: [{ _id: 'p1' }, { _id: 'p2' }, { _id: 'p3' }],
  sets: [{ numeroSet: 1 }, { numeroSet: 2 }],
};

describe('seleccionPlanilla', () => {
  it('sin selección se aprueba todo, como antes', () => {
    const r = seleccionPlanilla(undefined, planilla);
    expect([...r.presentes]).toEqual(['p1', 'p2', 'p3']);
    expect(r.incluirSets).toBe(true);
    expect(r.pisarSets.size).toBe(0);
    expect(r.resumen).toBeNull();
  });

  it('elegir jugadores descarta el resto y lo registra', () => {
    const r = seleccionPlanilla({ presentes: ['p1', 'p3'] }, planilla);
    expect([...r.presentes]).toEqual(['p1', 'p3']);
    expect(r.resumen.descartado.presentes).toEqual(['p2']);
  });

  it('un id ajeno a la planilla no se suma', () => {
    expect([...seleccionPlanilla({ presentes: ['p1', 'intruso'] }, planilla).presentes]).toEqual(['p1']);
  });

  it('sin sets: no se crean ni se pisan, y queda registrado', () => {
    const r = seleccionPlanilla({ sets: false, pisarSets: [1] }, planilla);
    expect(r.incluirSets).toBe(false);
    expect(r.pisarSets.size).toBe(0);
    expect(r.resumen.descartado.sets).toEqual([1, 2]);
  });

  it('pisar sets: sólo números que la planilla trae', () => {
    expect([...seleccionPlanilla({ pisarSets: [2, 9] }, planilla).pisarSets]).toEqual([2]);
  });
});

describe('seleccionLote', () => {
  it('sin selección publica todo', () => {
    expect(seleccionLote(null, ['a', 'b'])).toEqual({ publicar: ['a', 'b'], rechazar: [], resumen: null });
  });

  it('lo no elegido se rechaza; ids ajenos no se publican', () => {
    const r = seleccionLote({ statIds: ['b', 'zz'] }, ['a', 'b']);
    expect(r.publicar).toEqual(['b']);
    expect(r.rechazar).toEqual(['a']);
  });
});

describe('seleccionCamposContrato', () => {
  const cambios = { rol: 'capitan', fechaInicio: '2026-01-01', fechaFin: '2026-12-31', estado: 'baja' };

  it('sin selección aplica todo', () => {
    expect(seleccionCamposContrato(undefined, cambios).cambios).toEqual(cambios);
  });

  it('las fechas van juntas y lo no elegido se registra', () => {
    const r = seleccionCamposContrato({ campos: ['fechas'] }, cambios);
    expect(r.cambios).toEqual({ fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
    expect(r.resumen.descartado.campos).toEqual(['rol', 'estado']);
  });

  it('no se puede elegir un grupo que la solicitud no trae', () => {
    expect(seleccionCamposContrato({ campos: ['foto', 'rol'] }, cambios).cambios).toEqual({ rol: 'capitan' });
  });
});

describe('seleccionSegunAlcance', () => {
  it('completa (o sin alcance) deja la selección del aprobador como está', () => {
    expect(seleccionSegunAlcance(undefined, null)).toBeNull();
    expect(seleccionSegunAlcance('completa', { sets: false })).toEqual({ sets: false });
  });
  it('estructura no incorpora ningún jugador, aunque el aprobador no haya tocado nada', () => {
    expect(seleccionSegunAlcance('estructura', null)).toEqual({ presentes: [] });
    expect(seleccionSegunAlcance('estructura', { presentes: ['p1'], pisarSets: [2] })).toEqual({ presentes: [], pisarSets: [2] });
  });
  it('un alcance desconocido cuenta como completa', () => {
    expect(normalizarAlcance('cualquiera')).toBe('completa');
  });
});
