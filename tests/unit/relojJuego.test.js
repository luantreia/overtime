import { resolverDuracionTiempo, tiempoDeJuegoEnHora } from '../../src/utils/relojJuego.js';

describe('resolverDuracionTiempo', () => {
  it('sin nada cargado son 20 minutos', () => {
    expect(resolverDuracionTiempo({})).toBe(1200);
  });
  it('manda lo más específico: partido > fase > competencia', () => {
    const competencia = { duracionTiempoMinutos: 25 };
    const fase = { configuracion: { duracionTiempoMinutos: 15 } };
    expect(resolverDuracionTiempo({ competencia })).toBe(1500);
    expect(resolverDuracionTiempo({ competencia, fase })).toBe(900);
    expect(resolverDuracionTiempo({ competencia, fase, partido: { duracionTiempoMinutos: 10 } })).toBe(600);
  });
  it('ignora valores vacíos o inválidos', () => {
    expect(resolverDuracionTiempo({ partido: { duracionTiempoMinutos: null }, competencia: { duracionTiempoMinutos: 0 } })).toBe(1200);
  });
});

describe('tiempoDeJuegoEnHora', () => {
  const h = (mmss) => new Date(`2026-11-24T15:${mmss}Z`);
  // 1T arranca 15:30:00 con 20:00, time out 15:35:00 → 15:37:00, sigue.
  const registros = [
    { tipo: 'inicio', periodo: 1, hora: h('30:00'), restante: 1200 },
    { tipo: 'pausa', periodo: 1, hora: h('35:00'), restante: 900, motivo: 'time_out' },
    { tipo: 'reanuda', periodo: 1, hora: h('37:00'), restante: 900 },
  ];
  it('antes del inicio no hay tiempo de juego', () => {
    expect(tiempoDeJuegoEnHora(registros, h('29:00'))).toBeNull();
  });
  it('corre desde el inicio', () => {
    expect(tiempoDeJuegoEnHora(registros, h('33:00'))).toEqual({ periodo: 1, restante: 1020, corriendo: true });
  });
  it('se frena en la pausa', () => {
    expect(tiempoDeJuegoEnHora(registros, h('36:30'))).toEqual({ periodo: 1, restante: 900, corriendo: false });
  });
  it('la pausa no cuenta: 8 minutos reales son 6 de juego', () => {
    expect(tiempoDeJuegoEnHora(registros, h('38:00'))).toEqual({ periodo: 1, restante: 840, corriendo: true });
  });
  it('no baja de 0', () => {
    expect(tiempoDeJuegoEnHora(registros, new Date('2026-11-24T17:00:00Z')).restante).toBe(0);
  });
});
