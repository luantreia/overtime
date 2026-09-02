// services/jugadoresElegiblesService.js
//
// Quiénes pueden aparecer en la captura de estadísticas de un partido, para un equipo.
//
// El problema que resuelve: hasta ahora la captura ofrecía el plantel entero del equipo
// filtrado solo por `estado: 'aceptado'`, ignorando `desde`/`hasta`. Un contrato de
// 2023 dado de alta y nunca cerrado seguía apareciendo en un partido de la semana
// pasada. Peor: un contrato con `hasta` en el pasado tampoco se filtraba, porque nadie
// miraba la fecha del partido.
//
// La cascada va de lo más específico a lo más laxo, y se corta en el primer nivel que
// devuelva algo:
//
//   1. JugadorPartido  — la convocatoria real de ESE partido. Si existe, es la verdad.
//   2. JugadorTemporada — la lista de buena fe de la temporada del partido.
//   3. JugadorEquipo   — el plantel, acotado a los contratos vigentes A LA FECHA
//                        del partido (no a la fecha de hoy).
//
// Sobre eso se aplica la categoría de la competencia (Masculino / Femenino filtran;
// Mixto y Libre no). Ver categoriaElegibilidadService.js.
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import Competencia from '../models/Competencia/Competencia.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import JugadorTemporada from '../models/Jugador/JugadorTemporada.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
// Import por efecto: este servicio hace populate('jugador') y necesita el modelo
// registrado. En el server lo registra alguna ruta, pero un script que importe solo
// este servicio se rompía con "Schema hasn't been registered for model Jugador".
import '../models/Jugador/Jugador.js';
import {
  jugadorElegiblePorCategoria,
  categoriaRestringe,
} from './categoriaElegibilidadService.js';

const { Types } = mongoose;

const nombreDeJugador = (jugador) => {
  if (!jugador || typeof jugador === 'string') return 'Jugador';
  return (
    jugador.alias
    || [jugador.nombre, jugador.apellido].filter(Boolean).join(' ').trim()
    || 'Jugador'
  );
};

/**
 * Todas las formas con las que se puede nombrar al jugador: el alias y el nombre
 * completo. `nombre` (el que muestra la UI) prioriza el alias, así que un jugador con
 * alias queda con su nombre real invisible — y quien importa planillas o busca por
 * texto necesita las dos.
 */
const nombresDeJugador = (jugador) => {
  if (!jugador || typeof jugador === 'string') return [];
  const completo = [jugador.nombre, jugador.apellido].filter(Boolean).join(' ').trim();
  return [jugador.alias, completo, jugador.nombre].filter(Boolean);
};

/** ¿El contrato estaba vigente en esta fecha? Sin fecha, no filtramos por fecha. */
function vigenteEn(doc, fecha) {
  if (!fecha) return true;
  if (doc.desde && new Date(doc.desde) > fecha) return false;
  // `hasta` vacío significa contrato abierto, no vencido.
  if (doc.hasta && new Date(doc.hasta) < fecha) return false;
  return true;
}

/**
 * @returns {Promise<{
 *   origen: 'partido'|'temporada'|'equipo'|'ninguno',
 *   categoria: string|null,
 *   jugadores: Array<{jugadorId, jugadorPartidoId, nombre, numero, genero}>,
 *   excluidos: { porFecha: number, porCategoria: number },
 * }>}
 */
export async function obtenerJugadoresElegibles({ partidoId, equipoId }) {
  if (!Types.ObjectId.isValid(partidoId) || !Types.ObjectId.isValid(equipoId)) {
    return { origen: 'ninguno', categoria: null, jugadores: [], excluidos: { porFecha: 0, porCategoria: 0 } };
  }

  const partido = await Partido.findById(partidoId)
    .select('fecha competencia temporada equipoLocal equipoVisitante')
    .lean();
  if (!partido) return null;

  const juega = [partido.equipoLocal, partido.equipoVisitante]
    .filter(Boolean)
    .some((id) => String(id) === String(equipoId));
  if (!juega) return { noParticipa: true };

  const categoria = partido.competencia
    ? (await Competencia.findById(partido.competencia).select('categoria').lean())?.categoria ?? null
    : null;

  // La referencia temporal es la fecha del PARTIDO, no `new Date()`. Cargar un partido
  // viejo tiene que ofrecer el plantel que existía entonces.
  const fecha = partido.fecha ? new Date(partido.fecha) : null;

  const excluidos = { porFecha: 0, porCategoria: 0 };

  const aplicarCategoria = (candidatos) => {
    if (!categoriaRestringe(categoria)) return candidatos;
    const pasan = candidatos.filter((c) => jugadorElegiblePorCategoria(categoria, c.genero));
    excluidos.porCategoria = candidatos.length - pasan.length;
    return pasan;
  };

  // --- 1. Convocatoria real del partido -------------------------------------------
  const convocatoria = await JugadorPartido.find({ partido: partidoId, equipo: equipoId })
    .populate('jugador', 'nombre apellido alias foto genero')
    .lean();

  if (convocatoria.length) {
    const candidatos = convocatoria.map((jp) => ({
      jugadorId: String(jp.jugador?._id || jp.jugador),
      jugadorPartidoId: String(jp._id),
      nombre: nombreDeJugador(jp.jugador),
      nombres: nombresDeJugador(jp.jugador),
      numero: jp.numero,
      genero: jp.jugador?.genero ?? null,
    }));

    // La convocatoria ya es una decisión tomada por quien gestiona el partido: acá la
    // categoría se informa pero no se recorta, para no esconder a alguien que el
    // organizador puso a propósito.
    return {
      origen: 'partido',
      categoria,
      jugadores: candidatos,
      excluidos: {
        porFecha: 0,
        porCategoria: categoriaRestringe(categoria)
          ? candidatos.filter((c) => !jugadorElegiblePorCategoria(categoria, c.genero)).length
          : 0,
      },
    };
  }

  // --- 2. Lista de buena fe de la temporada ---------------------------------------
  if (partido.temporada) {
    const participacion = await ParticipacionTemporada.findOne({
      equipo: equipoId,
      temporada: partido.temporada,
    }).select('_id').lean();

    if (participacion) {
      const enTemporada = await JugadorTemporada.find({
        participacionTemporada: participacion._id,
        estado: 'aceptado',
      })
        .populate('jugador', 'nombre apellido alias foto genero')
        .lean();

      const vigentes = enTemporada.filter((jt) => vigenteEn(jt, fecha));
      excluidos.porFecha = enTemporada.length - vigentes.length;

      if (vigentes.length) {
        const candidatos = vigentes.map((jt) => ({
          jugadorId: String(jt.jugador?._id || jt.jugador),
          jugadorPartidoId: null,
          nombre: nombreDeJugador(jt.jugador),
          nombres: nombresDeJugador(jt.jugador),
          numero: jt.numeroCamiseta,
          genero: jt.jugador?.genero ?? null,
        }));

        return { origen: 'temporada', categoria, jugadores: aplicarCategoria(candidatos), excluidos };
      }
    }
  }

  // --- 3. Plantel, acotado a la fecha del partido ----------------------------------
  const plantel = await JugadorEquipo.find({ equipo: equipoId, estado: 'aceptado' })
    .populate('jugador', 'nombre apellido alias foto genero')
    .lean();

  const vigentes = plantel.filter((je) => vigenteEn(je, fecha));
  excluidos.porFecha = plantel.length - vigentes.length;

  const candidatos = vigentes.map((je) => ({
    jugadorId: String(je.jugador?._id || je.jugador),
    jugadorPartidoId: null,
    nombre: nombreDeJugador(je.jugador),
    nombres: nombresDeJugador(je.jugador),
    numero: undefined,
    genero: je.jugador?.genero ?? null,
  }));

  return {
    origen: candidatos.length ? 'equipo' : 'ninguno',
    categoria,
    jugadores: aplicarCategoria(candidatos),
    excluidos,
  };
}
