import { describe, it, expect } from '@jest/globals';
import { explicarAprobacion } from '../../src/utils/explicarAprobacion.js';

describe('explicarAprobacion', () => {
  it('el admin global puede aunque no esté en ningún grupo (igual que el PUT de aprobación)', () => {
    expect(explicarAprobacion({ estado: 'pendiente', esAdminGlobal: true, uid: 'u', grupos: {} }))
      .toEqual({ puedeAprobar: true, motivo: null });
  });

  it('puede si está en algún grupo', () => {
    expect(explicarAprobacion({ estado: 'pendiente', esAdminGlobal: false, uid: 'u', grupos: { equipo: ['x', 'u'] } }).puedeAprobar)
      .toBe(true);
  });

  it('si no puede, dice quién sí', () => {
    const r = explicarAprobacion({ estado: 'pendiente', esAdminGlobal: false, uid: 'u', grupos: { equipo: ['a'], competencia: ['b'], jugador: [] } });
    expect(r).toEqual({ puedeAprobar: false, motivo: 'La puede aprobar un admin del equipo o un admin de la competencia.' });
  });

  it('sin aprobadores cargados lo dice, en vez de un botón gris mudo', () => {
    expect(explicarAprobacion({ estado: 'pendiente', esAdminGlobal: false, uid: 'u', grupos: { equipo: [] } }).motivo)
      .toMatch(/no tiene administradores/);
  });

  it('una solicitud resuelta no se aprueba, ni siquiera el admin global', () => {
    expect(explicarAprobacion({ estado: 'aceptado', esAdminGlobal: true, uid: 'u', grupos: {} }))
      .toEqual({ puedeAprobar: false, motivo: 'Esta solicitud ya fue resuelta.' });
  });
});
