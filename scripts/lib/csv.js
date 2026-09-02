// scripts/lib/csv.js
//
// Parser de CSV mínimo pero correcto (RFC 4180): comillas dobles, comas y saltos de
// línea dentro de campos entrecomillados, y "" como comilla escapada.
//
// Se escribe a mano en vez de sumar una dependencia: es un script de importación, no
// código de producción, y un `papaparse` en el package.json del backend es superficie
// que después hay que mantener y auditar.

/**
 * @param {string} texto contenido completo del archivo
 * @returns {string[][]} filas de celdas, sin interpretar el header
 */
export function parsearCSV(texto) {
  // El BOM de Excel se cuela en la primera cabecera y rompe el match de columnas.
  const limpio = texto.replace(/^﻿/, '');

  const filas = [];
  let fila = [];
  let campo = '';
  let dentroDeComillas = false;

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];

    if (dentroDeComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ',' || c === ';') {
      // Excel en configuración regional española exporta con punto y coma.
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c === '\r') {
      // se ignora: el \n que sigue cierra la fila
    } else {
      campo += c;
    }
  }

  // Última fila sin salto de línea final.
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((celda) => celda.trim() !== ''));
}

/**
 * Igual que parsearCSV pero devuelve objetos usando la primera fila como cabecera.
 * Las claves se normalizan (minúscula, sin acentos, espacios a guión bajo) para que
 * "Nº Set", "nro set" y "nro_set" caigan todos en la misma.
 */
export function parsearCSVConCabecera(texto) {
  const filas = parsearCSV(texto);
  if (!filas.length) return { cabecera: [], filas: [] };

  const cabecera = filas[0].map((h) => normalizarClave(h));

  const objetos = filas.slice(1).map((f, idx) => {
    const obj = {};
    cabecera.forEach((clave, i) => {
      if (clave) obj[clave] = (f[i] ?? '').trim();
    });
    // Se guarda para poder decir "fila 37 del archivo" en los mensajes de error.
    obj.__linea = idx + 2;
    return obj;
  });

  return { cabecera, filas: objetos };
}

/** 'Nº Set' → 'n_set'; 'Atrapadas ' → 'atrapadas' */
export function normalizarClave(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    // Escapes en vez de los combining marks literales: escritos a mano dependen del
    // encoding con que se guarde este archivo.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
