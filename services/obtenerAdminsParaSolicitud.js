import mongoose from 'mongoose';

import Equipo from '../models/Equipo/Equipo.js';
import Competencia from '../models/Competencia/Competencia.js';
import Jugador from '../models/Jugador/Jugador.js';
import Organizacion from '../models/Organizacion.js';

import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import ParticipacionFase from '../models/Equipo/ParticipacionFase.js';
import Partido from '../models/Partido/Partido.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js';

import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import EstadisticasEquipoSet from '../models/Equipo/EstadisticasEquipoSet.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';

function extraerAdmins(doc, campos = []) {
  const ids = new Set();
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

export async function obtenerAdminsParaSolicitud(tipo, entidadId) {
  switch (tipo) {
    case 'contratoJugadorEquipo': {
      const contrato = await JugadorEquipo.findById(entidadId)
        .populate('equipo', 'administradores creadoPor')
        .populate('jugador', 'administradores creadoPor');
      if (!contrato) throw new Error('Contrato no encontrado');
      return extraerAdmins(contrato, ['equipo', 'jugador']);
    }

    case 'contratoEquipoCompetencia': {
      const contrato = await EquipoCompetencia.findById(entidadId)
        .populate('equipo', 'administradores creadoPor')
        .populate('competencia', 'administradores creadoPor');
      if (!contrato) throw new Error('Contrato no encontrado');
      return extraerAdmins(contrato, ['equipo', 'competencia']);
    }
        case 'jugadorCompetencia': {
      const jugadorCompetencia = await mongoose.model('JugadorCompetencia').findById(entidadId)
        .populate('competencia', 'administradores creadoPor');
      if (!jugadorCompetencia) throw new Error('JugadorCompetencia no encontrado');
      return extraerAdmins(jugadorCompetencia, ['competencia']);
    }

    case 'participacionFase':
    case 'jugadorFase': {
      const doc = await mongoose.model('ParticipacionFase').findById(entidadId)
        .populate({
          path: 'fase',
          populate: {
            path: 'competencia',
            select: 'administradores creadoPor'
          }
        });
      if (!doc) throw new Error('Participación no encontrada');
      return extraerAdmins(doc.fase, ['competencia']);
    }
    case 'participacionTemporada':
    case 'jugadorTemporada': {
      const doc = await ParticipacionTemporada.findById(entidadId)
        .populate({
          path: 'equipoCompetencia',
          populate: [
            { path: 'equipo', select: 'administradores creadoPor' },
            { path: 'competencia', select: 'administradores creadoPor' }
          ]
        });
      if (!doc) throw new Error('Participación no encontrada');
      return extraerAdmins(doc.equipoCompetencia, ['equipo', 'competencia']);
    }

    case 'resultadoPartido':
    case 'estadisticasEquipoPartido':
    case 'estadisticasJugadorPartido': {
      const partido = await Partido.findById(entidadId)
        .populate('competencia', 'administradores creadoPor')
        .populate('administradores', '_id'); // para amistosos
      if (!partido) throw new Error('Partido no encontrado');

      if (partido.competencia) {
        return extraerAdmins(partido, ['competencia']);
      } else {
        // Partido amistoso: validar admins propios del partido
        const creador = partido.creadoPor?.toString();
        const admins = (partido.administradores || []).map(a => a._id?.toString() || a.toString());
        return [creador, ...admins].filter(Boolean);
      }
    }

    case 'resultadoSet':
    case 'estadisticasEquipoSet':
    case 'estadisticasJugadorSet': {
      // Estos dependen del partido => navegar desde SetPartido
      // NOTA: Esto requiere que el SetPartido tenga referencia a `partido`
      const SetPartido = mongoose.model('SetPartido');
      const set = await SetPartido.findById(entidadId).populate('partido');
      if (!set || !set.partido) throw new Error('Set no encontrado');
      return obtenerAdminsParaSolicitud('resultadoPartido', set.partido._id);
    }

    case 'equipoPartido': {
      const relacion = await EquipoPartido.findById(entidadId)
        .populate({
          path: 'equipo',
          select: 'administradores creadoPor'
        })
        .populate({
          path: 'partido',
          populate: { path: 'competencia', select: 'administradores creadoPor' }
        });
      if (!relacion) throw new Error('EquipoPartido no encontrado');

      const adminsEquipo = extraerAdmins(relacion, ['equipo']);
      const adminsCompetencia = extraerAdmins(relacion.partido, ['competencia']);
      return [...new Set([...adminsEquipo, ...adminsCompetencia])];
    }

    default:
      throw new Error(`Tipo de solicitud "${tipo}" no implementado`);
  }
}
