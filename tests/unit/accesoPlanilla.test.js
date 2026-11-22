import { describe, it, expect } from '@jest/globals';
import { decidirAccesoPlanilla } from '../../src/services/planillaEquipoService.js';

/**
 * La matriz de acceso a una planilla según su tipo de dueño. Es la pieza donde un error
 * filtra planillas privadas, así que cada celda tiene su caso.
 */
const decidir = (planilla, accion, hechos) => decidirAccesoPlanilla({ planilla, accion, hechos });
const NO = { permitido: false, ocultarNotas: true };
const COMPLETO = { permitido: true, ocultarNotas: false };
const SIN_NOTAS = { permitido: true, ocultarNotas: true };

const deEquipo = (estado = 'borrador') => ({ tipoDuenio: 'equipo', estado });
const deJugador = (estado = 'borrador') => ({ tipoDuenio: 'jugador', estado });
const deOrganizacion = (estado = 'borrador') => ({ tipoDuenio: 'organizacion', estado });

describe('acceso a planilla: admin global', () => {
  it('lee y edita cualquier planilla, con notas', () => {
    for (const p of [deEquipo(), deJugador(), deOrganizacion()]) {
      expect(decidir(p, 'leer', { esAdminGlobal: true })).toEqual(COMPLETO);
      expect(decidir(p, 'editar', { esAdminGlobal: true })).toEqual(COMPLETO);
    }
  });
});

describe('acceso a planilla de equipo', () => {
  it('sin tipoDuenio se trata como de equipo (planillas viejas)', () => {
    expect(decidir({ estado: 'borrador' }, 'leer', { esCuerpoTecnico: true })).toEqual(COMPLETO);
  });

  it('el cuerpo técnico lee y edita, con notas', () => {
    expect(decidir(deEquipo(), 'leer', { esCuerpoTecnico: true })).toEqual(COMPLETO);
    expect(decidir(deEquipo(), 'editar', { esCuerpoTecnico: true })).toEqual(COMPLETO);
  });

  it('el plantel lee los números pero no las notas', () => {
    expect(decidir(deEquipo(), 'leer', { esJugadorDelPlantel: true })).toEqual(SIN_NOTAS);
  });

  it('el plantel no edita', () => {
    expect(decidir(deEquipo(), 'editar', { esJugadorDelPlantel: true })).toEqual(NO);
  });

  it('un tercero no ve nada', () => {
    expect(decidir(deEquipo(), 'leer', {})).toEqual(NO);
  });

  it('la organización del partido NO ve un borrador', () => {
    expect(decidir(deEquipo('borrador'), 'leer', { esOrganizacionDelPartido: true })).toEqual(NO);
  });

  it('la organización del partido ve la planilla desde que se pide oficializar', () => {
    for (const estado of ['pendiente_oficializacion', 'oficializada', 'rechazada']) {
      expect(decidir(deEquipo(estado), 'leer', { esOrganizacionDelPartido: true })).toEqual(COMPLETO);
    }
  });

  it('la organización del partido nunca edita la planilla del equipo', () => {
    expect(decidir(deEquipo('pendiente_oficializacion'), 'editar', { esOrganizacionDelPartido: true })).toEqual(NO);
  });
});

describe('acceso a planilla de jugador', () => {
  it('el jugador dueño lee y edita', () => {
    expect(decidir(deJugador(), 'leer', { esJugadorDuenio: true })).toEqual(COMPLETO);
    expect(decidir(deJugador(), 'editar', { esJugadorDuenio: true })).toEqual(COMPLETO);
  });

  it('el cuerpo técnico o un compañero no la ven (todavía no hay aporte)', () => {
    expect(decidir(deJugador(), 'leer', { esCuerpoTecnico: true, esJugadorDelPlantel: true })).toEqual(NO);
  });

  it('la organización sólo la ve tras pedir oficializar', () => {
    expect(decidir(deJugador('borrador'), 'leer', { esOrganizacionDelPartido: true })).toEqual(NO);
    expect(decidir(deJugador('pendiente_oficializacion'), 'leer', { esOrganizacionDelPartido: true })).toEqual(COMPLETO);
  });
});

describe('acceso a planilla de organización', () => {
  it('sus administradores leen y editan', () => {
    expect(decidir(deOrganizacion(), 'leer', { esAdminOrganizacionDuenia: true })).toEqual(COMPLETO);
    expect(decidir(deOrganizacion(), 'editar', { esAdminOrganizacionDuenia: true })).toEqual(COMPLETO);
  });

  it('otra organización con permisos sobre el partido no la ve, en ningún estado', () => {
    expect(decidir(deOrganizacion('oficializada'), 'leer', { esOrganizacionDelPartido: true })).toEqual(NO);
  });
});

describe('acciones desconocidas', () => {
  it('se niegan', () => {
    expect(decidir(deEquipo(), 'borrar', { esCuerpoTecnico: true })).toEqual(NO);
  });
});
