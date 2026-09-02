// tests/unit/importarPlanillas.test.js
import { describe, it, expect } from '@jest/globals';
import { parsearCSVConCabecera, normalizarClave } from '../../scripts/lib/csv.js';
import {
  resolverColumnas,
  normalizarFilas,
  parsearFecha,
  parsearGanador,
  matchearNombre,
} from '../../scripts/lib/normalizarPlanilla.js';
import { extraerOuts } from '../../scripts/lib/parsearPlanillaMoran.js';

describe('Importador de planillas', () => {
  describe('parser de CSV', () => {
    it('respeta las comas dentro de campos entrecomillados', () => {
      const { filas } = parsearCSVConCabecera('jugador,tiros\n"Gómez, Ana",8\n');
      expect(filas[0].jugador).toBe('Gómez, Ana');
      expect(filas[0].tiros).toBe('8');
    });

    it('acepta punto y coma como separador (Excel en español)', () => {
      const { filas } = parsearCSVConCabecera('jugador;tiros\nAna;8\n');
      expect(filas[0].jugador).toBe('Ana');
    });

    it('descarta el BOM que Excel mete en la primera cabecera', () => {
      const { cabecera } = parsearCSVConCabecera('﻿jugador,tiros\nAna,8\n');
      expect(cabecera[0]).toBe('jugador');
    });

    it('ignora filas totalmente vacías', () => {
      const { filas } = parsearCSVConCabecera('jugador,tiros\nAna,8\n,\n\n');
      expect(filas).toHaveLength(1);
    });
  });

  describe('normalizarClave', () => {
    it('unifica acentos, símbolos y mayúsculas', () => {
      expect(normalizarClave('Nº Set')).toBe('n_set');
      expect(normalizarClave('  Atrapadas ')).toBe('atrapadas');
      expect(normalizarClave('Nro. Set')).toBe('nro_set');
    });
  });

  describe('resolverColumnas', () => {
    it('mapea nombres en español a los campos canónicos', () => {
      const { mapa, faltantes } = resolverColumnas([
        'fecha', 'rival', 'n_set', 'jugador', 'tiros', 'impactos', 'atrapadas',
      ]);
      expect(faltantes).toEqual([]);
      expect(mapa.throws).toBe('tiros');
      expect(mapa.hits).toBe('impactos');
      expect(mapa.catches).toBe('atrapadas');
      expect(mapa.set).toBe('n_set');
    });

    it('reporta las columnas obligatorias que faltan', () => {
      const { faltantes } = resolverColumnas(['fecha', 'tiros']);
      expect(faltantes).toEqual(['rival', 'jugador']);
    });

    it('sin columna de set el archivo sigue siendo válido (modo directa)', () => {
      const { mapa, faltantes } = resolverColumnas(['fecha', 'rival', 'jugador', 'tiros']);
      expect(faltantes).toEqual([]);
      expect(mapa.set).toBeUndefined();
    });
  });

  describe('parsearFecha', () => {
    it('lee ISO', () => {
      expect(parsearFecha('2026-08-15').getMonth()).toBe(7);
      expect(parsearFecha('2026-08-15').getDate()).toBe(15);
    });

    // Convención local: 08/09 es 8 de septiembre, no 9 de agosto.
    it('interpreta d/m/a, no m/d/a', () => {
      const f = parsearFecha('08/09/2026');
      expect(f.getDate()).toBe(8);
      expect(f.getMonth()).toBe(8);
    });

    it('acepta año de dos dígitos', () => {
      expect(parsearFecha('15/08/26').getFullYear()).toBe(2026);
    });

    it('devuelve null en vez de inventar una fecha', () => {
      expect(parsearFecha('fecha mala')).toBeNull();
      expect(parsearFecha('')).toBeNull();
      expect(parsearFecha('45/13/2026')).toBeNull();
    });
  });

  describe('parsearGanador', () => {
    it('acepta la óptica del club además de local/visitante', () => {
      expect(parsearGanador('Ganamos')).toBe('propio');
      expect(parsearGanador('rival')).toBe('rival');
      expect(parsearGanador('Empate')).toBe('empate');
      expect(parsearGanador('local')).toBe('local');
      expect(parsearGanador('cualquier cosa')).toBeNull();
    });
  });

  describe('matchearNombre', () => {
    const plantel = [
      { nombre: 'Juan Pérez', jugadorId: '1' },
      { nombre: 'Ana Gómez', jugadorId: '2' },
      { nombre: 'Juan Rodríguez', jugadorId: '3' },
    ];

    it('matchea sin importar acentos, mayúsculas ni orden', () => {
      expect(matchearNombre('juan perez', plantel).match?.jugadorId).toBe('1');
      expect(matchearNombre('PEREZ JUAN', plantel).match?.jugadorId).toBe('1');
      expect(matchearNombre('Gómez, Ana', plantel).match?.jugadorId).toBe('2');
    });

    it('acepta un nombre parcial si es único', () => {
      expect(matchearNombre('Ana', plantel).match?.jugadorId).toBe('2');
    });

    // Lo más importante del importador: ante la duda NO adivina. Asignarle las
    // estadísticas de un partido al jugador equivocado es peor que no importarlas,
    // porque después no se distingue de un dato real.
    it('devuelve ambiguo en vez de elegir entre dos candidatos', () => {
      const r = matchearNombre('Juan', plantel);
      expect(r.match).toBeNull();
      expect(r.motivo).toBe('ambiguo');
      expect(r.opciones).toHaveLength(2);
    });

    it('reporta cuando no hay ninguna coincidencia', () => {
      expect(matchearNombre('Pedro Nadie', plantel).motivo).toBe('sin-coincidencia');
      expect(matchearNombre('', plantel).motivo).toBe('sin-coincidencia');
    });

    it('busca también por el nombre completo, no solo por el alias', () => {
      const conAlias = [
        { nombre: 'Sugar', nombres: ['Sugar', 'Matias Zayas'], jugadorId: '1' },
      ];
      expect(matchearNombre('Matias Zayas', conAlias).match?.jugadorId).toBe('1');
      expect(matchearNombre('Sugar', conAlias).match?.jugadorId).toBe('1');
    });

    // Bug real: el alias "Mati" (de Matías Giménez) matcheaba "MATI ZAYAS", que es otra
    // persona, porque el nombre entero del candidato entraba en el nombre buscado. Como
    // era la única coincidencia, el matcheo la daba por buena y las estadísticas de
    // Zayas terminaban escritas sobre Giménez.
    it('un alias de un solo token no se traga un nombre de dos', () => {
      const conAliasCorto = [
        { nombre: 'Mati', nombres: ['Mati', 'Matias Gimenez'], jugadorId: 'gimenez' },
        { nombre: 'Sugar', nombres: ['Sugar', 'Matias Zayas'], jugadorId: 'zayas' },
      ];
      // Ninguna de las dos formas cortas resuelve sola: "mati" no es "matias", y el
      // alias de un token ya no se estira para cubrir la diferencia. Quedan sin
      // coincidencia, que es el resultado seguro — el importador las reporta y se
      // resuelven con una entrada de alias explícita.
      expect(matchearNombre('MATI ZAYAS', conAliasCorto).match).toBeNull();
      expect(matchearNombre('MATI GIMENEZ', conAliasCorto).match).toBeNull();

      // "Mati" exacto sí resuelve: la coincidencia exacta es inequívoca.
      expect(matchearNombre('Mati', conAliasCorto).match?.jugadorId).toBe('gimenez');

      // Y el nombre completo sigue funcionando en las dos direcciones.
      expect(matchearNombre('Matias Zayas', conAliasCorto).match?.jugadorId).toBe('zayas');
      expect(matchearNombre('Zayas Matias', conAliasCorto).match?.jugadorId).toBe('zayas');
    });
  });

  // La columna de outs de las planillas del club no es numérica: anota la CAUSA de cada
  // out con letras. Leerla con un extractor de números daba 0 outs en ~700 filas reales.
  describe('extraerOuts', () => {
    it('una letra de causa sola vale un out', () => {
      for (const codigo of ['H', 'h', 'C', 'L', 'LC', 'LI', 'SE', 'EC', 'SL', 'TA', 'PL', 'SP', 'E']) {
        expect(extraerOuts(codigo).outs).toBe(1);
      }
    });

    it('con número, el número es la cantidad y la letra la causa', () => {
      expect(extraerOuts('1 LC').outs).toBe(1);
      expect(extraerOuts('1LC').outs).toBe(1);
      expect(extraerOuts('2 LC').outs).toBe(2);
      expect(extraerOuts('1.0').outs).toBe(1);
      expect(extraerOuts('2.0').outs).toBe(2);
    });

    it('el rótulo de la fila sin valor no es un out', () => {
      expect(extraerOuts('O').outs).toBe(0);
      expect(extraerOuts('O:').outs).toBe(0);
      expect(extraerOuts('O: ').outs).toBe(0);
      expect(extraerOuts('').outs).toBe(0);
    });

    it('descuenta el rótulo embebido antes de leer la causa', () => {
      expect(extraerOuts('O:H').outs).toBe(1);
      expect(extraerOuts('O: C').outs).toBe(1);
    });

    it('suma los outs separados por / , o |', () => {
      expect(extraerOuts('H / H').outs).toBe(2);
      expect(extraerOuts('H,H').outs).toBe(2);
      expect(extraerOuts('1 | 1LC').outs).toBe(2);
      expect(extraerOuts('C / H').outs).toBe(2);
      expect(extraerOuts('O:H²/H').outs).toBe(3);
    });

    it('lee el superíndice como repetición', () => {
      expect(extraerOuts('H²').outs).toBe(2);
      expect(extraerOuts('H2').outs).toBe(2);
      expect(extraerOuts('O:H²').outs).toBe(2);
    });

    // "hh" es la misma causa dos veces; "LC" son dos letras que forman UN código.
    it('distingue una letra repetida de un código de dos letras', () => {
      expect(extraerOuts('hh').outs).toBe(2);
      expect(extraerOuts('cc').outs).toBe(2);
      expect(extraerOuts('LC').outs).toBe(1);
      expect(extraerOuts('SE').outs).toBe(1);
    });

    it('marca para revisión dos códigos en el mismo tramo', () => {
      const r = extraerOuts('O:H SP');
      expect(r.outs).toBe(1);
      expect(r.revisar).toBe(true);
    });
  });

  describe('normalizarFilas', () => {
    const csv = [
      'Fecha,Rival,Nº Set,Ganador,Jugador,Tiros,Impactos,Outs,Atrapadas,Sobrevive',
      '15/08/2026,Hydra,1,Ganamos,Juan Pérez,10,4,1,2,si',
      'fecha mala,Noazar,1,,Juan Pérez,1,1,1,1,',
      '2026-08-22,,1,,Juan Pérez,1,1,1,1,',
      '2026-08-22,Noazar,cero,,Juan Pérez,1,1,1,1,',
    ].join('\n');

    it('separa filas válidas de filas rotas, con número de línea', () => {
      const { cabecera, filas: crudas } = parsearCSVConCabecera(csv);
      const { mapa } = resolverColumnas(cabecera);
      const { filas, errores } = normalizarFilas(crudas, mapa);

      expect(filas).toHaveLength(1);
      expect(errores).toHaveLength(3);
      expect(errores.map((e) => e.linea)).toEqual([3, 4, 5]);
      expect(errores[0].error).toMatch(/Fecha ilegible/);
      expect(errores[1].error).toMatch(/rival/i);
      expect(errores[2].error).toMatch(/Set inválido/);
    });

    it('convierte los contadores y el booleano', () => {
      const { cabecera, filas: crudas } = parsearCSVConCabecera(csv);
      const { mapa } = resolverColumnas(cabecera);
      const { filas } = normalizarFilas(crudas, mapa);

      expect(filas[0]).toMatchObject({
        rival: 'Hydra',
        numeroSet: 1,
        ganadorSet: 'propio',
        jugador: 'Juan Pérez',
        throws: 10,
        hits: 4,
        outs: 1,
        catches: 2,
        survive: true,
      });
    });

    it('nunca produce contadores negativos', () => {
      const { cabecera, filas: crudas } = parsearCSVConCabecera(
        'fecha,rival,jugador,tiros\n2026-08-15,Hydra,Ana,-5\n',
      );
      const { mapa } = resolverColumnas(cabecera);
      const { filas } = normalizarFilas(crudas, mapa);
      expect(filas[0].throws).toBe(0);
    });
  });
});
