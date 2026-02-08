import mongoose from 'mongoose';

import Equipo from '../models/Equipo/Equipo.js';
import Competencia from '../models/Competencia/Competencia.js';
import Jugador from '../models/Jugador/Jugador.js';
import Organizacion from '../models/Organizacion.js';
import Temporada from '../models/Competencia/Temporada.js';

import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import JugadorTemporada from '../models/Jugador/JugadorTemporada.js';
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import ParticipacionFase from '../models/Equipo/ParticipacionFase.js';
import Partido from '../models/Partido/Partido.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js';

import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';

function extraerIds(doc, campos = []) {
  const ids = new Set();
  if (!doc) return [];
  
  // Si pasamos el documento directo (ej. un Equipo)
  if (doc.creadoPor && campos.length === 0) ids.add(doc.creadoPor.toString());
  if (Array.isArray(doc.administradores) && campos.length === 0) {
    doc.administradores.forEach(a => ids.add(a.toString()));
  }

  // Si buscamos en subcampos
  for (const campo of campos) {
    const obj = doc[campo];
    if (obj) {
      if (obj.creadoPor) ids.add(obj.creadoPor.toString());
      if (Array.isArray(obj.administradores)) {
        obj.administradores.forEach(a => ids.add(a.toString()));
      }
    }
  }
  return Array.from(ids);
}

/**
 * Retorna los administradores involucrados en una solicitud, agrupados por rol/entidad.
 * @param {string} tipo 
 * @param {string} entidadId 
 * @param {object} datosPropuestos 
 * @returns {Promise<{ all: string[], grupos: Record<string, string[]> }>}
 */
export async function obtenerAdminsParaSolicitud(tipo, entidadId, datosPropuestos = {}) {
  const grupos = {};

  // Helper para normalizar arrays de IDs
  const toIds = (arr) => arr.map(x => x?.toString?.() || x);

  if (tipo.startsWith('jugador-equipo-')) {
    let equipo = null, jugador = null;

    if (tipo === 'jugador-equipo-crear') {
      const { equipoId, jugadorId } = datosPropuestos;
      const [eq, jug] = await Promise.all([
        equipoId ? Equipo.findById(equipoId).select('administradores creadoPor') : null,
        jugadorId ? Jugador.findById(jugadorId).select('administradores creadoPor') : null,
      ]);
      equipo = eq;
      jugador = jug;
    } else {
      // editar o eliminar
      let contrato = null;
      if (entidadId) {
        contrato = await JugadorEquipo.findById(entidadId)
          .populate('equipo', 'administradores creadoPor')
          .populate('jugador', 'administradores creadoPor');
      }
      if (!contrato && datosPropuestos.contratoId) {
        contrato = await JugadorEquipo.findById(datosPropuestos.contratoId)
          .populate('equipo', 'administradores creadoPor')
          .populate('jugador', 'administradores creadoPor');
      }
      if (contrato) {
        equipo = contrato.equipo;
        jugador = contrato.jugador;
      }
    }

    grupos.equipo = extraerIds(equipo);
    grupos.jugador = extraerIds(jugador);

  } else if (tipo.startsWith('participacion-temporada-')) {
    let equipo = null, competencia = null;

    if (tipo === 'participacion-temporada-crear') {
      const { equipoId, temporadaId } = datosPropuestos;
      const [eq, temp] = await Promise.all([
        equipoId ? Equipo.findById(equipoId).select('administradores creadoPor') : null,
        temporadaId ? Temporada.findById(temporadaId).populate('competencia', 'administradores creadoPor') : null,
      ]);
      equipo = eq;
      competencia = temp?.competencia;
    } else {
      let pt = null;
      const id = entidadId || datosPropuestos.participacionTemporadaId;
      if (id) {
        pt = await ParticipacionTemporada.findById(id)
          .populate('equipo', 'administradores creadoPor')
          .populate({ path: 'temporada', populate: { path: 'competencia', select: 'administradores creadoPor' } });
      }
      if (pt) {
        equipo = pt.equipo;
        competencia = pt.temporada?.competencia;
      }
    }

    grupos.equipo = extraerIds(equipo);
    grupos.competencia = extraerIds(competencia);

  } else if (tipo.startsWith('jugador-temporada-')) {
    let equipo = null, competencia = null;

    if (tipo === 'jugador-temporada-crear') {
      const { jugadorEquipoId, participacionTemporadaId } = datosPropuestos;
      const [je, pt] = await Promise.all([
        jugadorEquipoId ? JugadorEquipo.findById(jugadorEquipoId).populate('equipo', 'administradores creadoPor') : null,
        participacionTemporadaId ? ParticipacionTemporada.findById(participacionTemporadaId).populate({ path: 'temporada', populate: { path: 'competencia', select: 'administradores creadoPor' } }) : null
      ]);
      equipo = je?.equipo || pt?.equipo;
      competencia = pt?.temporada?.competencia;
    } else {
      let jt = null;
      const id = entidadId || datosPropuestos.jugadorTemporadaId;
      if (id) {
        jt = await JugadorTemporada.findById(id)
          .populate({ path: 'participacionTemporada', populate: { path: 'temporada', populate: { path: 'competencia', select: 'administradores creadoPor' } } })
          .populate({ path: 'jugadorEquipo', populate: { path: 'equipo', select: 'administradores creadoPor' } });
      }
      if (jt) {
        equipo = jt.jugadorEquipo?.equipo;
        competencia = jt.participacionTemporada?.temporada?.competencia;
      }
    }

    grupos.equipo = extraerIds(equipo);
    grupos.competencia = extraerIds(competencia);

  } else {
    // Lógica legacy o simple para otros tipos
    switch (tipo) {
      case 'resultadoPartido':
      case 'estadisticasEquipoPartido':
      case 'estadisticasJugadorPartido': {
        const partido = await Partido.findById(entidadId)
          .populate('competencia', 'administradores creadoPor')
          .populate('administradores', '_id');
        
        if (partido?.competencia) {
          grupos.competencia = extraerIds(partido, ['competencia']);
        } else if (partido) {
          // Amistoso
          const creador = partido.creadoPor?.toString();
          const admins = (partido.administradores || []).map(a => a._id?.toString() || a.toString());
          grupos.partido = [creador, ...admins].filter(Boolean);
        }
        break;
      }
      case 'usuario-solicitar-admin-jugador':
      case 'jugador-claim': {
        const id = entidadId || datosPropuestos.jugadorId;
        const jugador = await Jugador.findById(id).select('administradores creadoPor');
        if (jugador) {
          grupos.jugador = extraerIds(jugador);
        }
        break;
      }
      case 'usuario-solicitar-admin-equipo': {
        const id = entidadId || datosPropuestos.equipoId;
        const equipo = await Equipo.findById(id).select('administradores creadoPor');
        if (equipo) {
          grupos.equipo = extraerIds(equipo);
        }
        break;
      }
      case 'usuario-solicitar-admin-organizacion': {
        const id = entidadId || datosPropuestos.organizacionId;
        const org = await Organizacion.findById(id).select('administradores creadoPor');
        if (org) {
          grupos.organizacion = extraerIds(org);
        }
        break;
      }
      // ... otros casos simples se pueden agregar aquí
    }
  }

  // Generar lista plana 'all'
  const allSet = new Set();
  Object.values(grupos).forEach(arr => arr.forEach(id => allSet.add(id)));
  
  return {
    all: Array.from(allSet),
    grupos
  };
}
