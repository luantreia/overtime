// tests/unit/categoriaElegibilidad.test.js
import { describe, it, expect } from '@jest/globals';
import {
  jugadorElegiblePorCategoria,
  categoriaRestringe,
  filtroMongoPorCategoria,
} from '../../src/services/categoriaElegibilidadService.js';

describe('Elegibilidad por categoría de competencia', () => {
  describe('jugadorElegiblePorCategoria', () => {
    it('excluye el género opuesto en una competencia Masculino', () => {
      expect(jugadorElegiblePorCategoria('Masculino', 'femenino')).toBe(false);
      expect(jugadorElegiblePorCategoria('Masculino', 'masculino')).toBe(true);
    });

    it('excluye el género opuesto en una competencia Femenino', () => {
      expect(jugadorElegiblePorCategoria('Femenino', 'masculino')).toBe(false);
      expect(jugadorElegiblePorCategoria('Femenino', 'femenino')).toBe(true);
    });

    it('no excluye a nadie en Mixto ni en Libre', () => {
      for (const genero of ['masculino', 'femenino', 'otro']) {
        expect(jugadorElegiblePorCategoria('Mixto', genero)).toBe(true);
        expect(jugadorElegiblePorCategoria('Libre', genero)).toBe(true);
      }
    });

    // Este es el caso que importa: 'otro' es el DEFAULT del schema de Jugador, así que
    // la mayoría de los jugadores cargados sin completar el dato lo tienen. Excluirlos
    // por no coincidir exactamente vaciaría planteles enteros.
    it("deja pasar el género 'otro' en cualquier categoría", () => {
      expect(jugadorElegiblePorCategoria('Masculino', 'otro')).toBe(true);
      expect(jugadorElegiblePorCategoria('Femenino', 'otro')).toBe(true);
    });

    it('deja pasar cuando falta el género o la categoría', () => {
      expect(jugadorElegiblePorCategoria('Masculino', null)).toBe(true);
      expect(jugadorElegiblePorCategoria('Masculino', undefined)).toBe(true);
      expect(jugadorElegiblePorCategoria(null, 'femenino')).toBe(true);
      expect(jugadorElegiblePorCategoria('', 'femenino')).toBe(true);
    });

    // Competencia.categoria viene capitalizada y Jugador.genero en minúscula: comparar
    // sin normalizar no rompe nada, simplemente no excluye a nadie nunca.
    it('normaliza mayúsculas de los dos lados', () => {
      expect(jugadorElegiblePorCategoria('MASCULINO', 'FEMENINO')).toBe(false);
      expect(jugadorElegiblePorCategoria('  Femenino  ', 'Masculino')).toBe(false);
    });
  });

  describe('categoriaRestringe', () => {
    it('distingue las categorías que filtran de las que no', () => {
      expect(categoriaRestringe('Masculino')).toBe(true);
      expect(categoriaRestringe('Femenino')).toBe(true);
      expect(categoriaRestringe('Mixto')).toBe(false);
      expect(categoriaRestringe('Libre')).toBe(false);
      expect(categoriaRestringe(null)).toBe(false);
    });
  });

  describe('filtroMongoPorCategoria', () => {
    it('devuelve null cuando la categoría no restringe', () => {
      expect(filtroMongoPorCategoria('Mixto')).toBeNull();
      expect(filtroMongoPorCategoria(null)).toBeNull();
    });

    it('excluye por desigualdad, no por igualdad', () => {
      // $ne también matchea los documentos sin el campo, que es lo que queremos:
      // un jugador viejo sin `genero` no debe desaparecer de la lista.
      expect(filtroMongoPorCategoria('Masculino')).toEqual({ genero: { $ne: 'femenino' } });
      expect(filtroMongoPorCategoria('Femenino')).toEqual({ genero: { $ne: 'masculino' } });
    });

    it('permite renombrar el campo', () => {
      expect(filtroMongoPorCategoria('Masculino', 'jugador.genero')).toEqual({
        'jugador.genero': { $ne: 'femenino' },
      });
    });
  });
});
