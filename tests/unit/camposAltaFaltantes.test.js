import { describe, it, expect } from '@jest/globals';
import { camposAltaFaltantes } from '../../src/utils/camposAltaFaltantes.js';

/**
 * Una solicitud de alta sin los campos que definen la entidad no puede crearse: si no, el
 * aprobador ve una solicitud vacía y aprobarla falla en el save() del modelo.
 */
describe('camposAltaFaltantes', () => {
  it('rechaza crear organización sin nombre (el caso que llegó a producción con {})', () => {
    expect(camposAltaFaltantes('usuario-crear-organizacion', {})).toEqual(['nombre']);
    expect(camposAltaFaltantes('usuario-crear-organizacion', { nombre: '   ' })).toEqual(['nombre']);
    expect(camposAltaFaltantes('usuario-crear-organizacion', undefined)).toEqual(['nombre']);
  });

  it('acepta crear organización con nombre', () => {
    expect(camposAltaFaltantes('usuario-crear-organizacion', { nombre: 'Liga Sur' })).toEqual([]);
  });

  it('usa los camposCriticos del tipo: jugador pide nombre y fecha de nacimiento', () => {
    expect(camposAltaFaltantes('usuario-crear-jugador', { nombre: 'Ana' })).toEqual(['fechaNacimiento']);
    expect(camposAltaFaltantes('usuario-crear-jugador', { nombre: 'Ana', fechaNacimiento: '2000-01-01' })).toEqual([]);
  });

  it('equipo pide nombre', () => {
    expect(camposAltaFaltantes('usuario-crear-equipo', { tipo: 'amateur' })).toEqual(['nombre']);
  });

  it('no valida tipos que no son de alta', () => {
    expect(camposAltaFaltantes('resultadoSet', {})).toEqual([]);
    expect(camposAltaFaltantes('tipo-inexistente', {})).toEqual([]);
  });
});
