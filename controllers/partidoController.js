// server/controllers/partidoController.js
import Partido from '../models/Partido.js';
import { actualizarParticipacionFase } from '../services/participacionFaseService.js'; // función que debes crear

// Obtener partidos con filtro por tipo y otros filtros opcionales
export async function obtenerPartidos(req, res) {
  try {
    const { tipo, modalidad, estado, competenciaId } = req.query;

    const filtro = {};

    // Filtrado por tipo: amistoso (sin competencia), competencia (con competencia)
    if (tipo === 'amistoso') {
      filtro.competencia = { $exists: false };
    } else if (tipo === 'competencia') {
      filtro.competencia = { $exists: true, $ne: null };
    }

    // Filtrado adicional por modalidad, estado o competenciaId si se proveen
    if (modalidad) filtro.modalidad = modalidad;
    if (estado) filtro.estado = estado;
    if (competenciaId) filtro.competencia = competenciaId;

    const partidos = await Partido.find(filtro)
      .sort({ fecha: -1 })
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    res.json(partidos);
  } catch (error) {
    console.error('Error al obtener partidos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener partidos.' });
  }
}

// Obtener partido por ID 
export async function obtenerPartidoPorId(req, res) {
  try {
    const { id } = req.params;
    const partido = await Partido.findById(id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('sets.statsJugadoresSet.jugador', 'nombre alias')
      .lean();

    if (!partido) return res.status(404).json({ error: 'Partido no encontrado.' });
    res.json(partido);
  } catch (error) {
    console.error(`Error al obtener partido con ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Error al obtener el partido.' });
  }
}

// Crear partido (amistoso o de competencia)
export async function crearPartido(req, res) {
  try {
    const {
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado = 'programado',
      competencia,
      fase,
      modalidad,
      categoria,
      sets = [],
    } = req.body;

    const creadoPor = req.user.uid;
    if (!creadoPor) return res.status(401).json({ error: 'No autenticado.' });

    const nuevoPartido = new Partido({
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado,
      competencia,
      fase,
      modalidad,
      categoria,
      sets,
      creadoPor,
      administradores: [creadoPor],
    });

    const partidoGuardado = await nuevoPartido.save();
    const partidoCompleto = await Partido.findById(partidoGuardado._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    res.status(201).json(partidoCompleto);
  } catch (error) {
    console.error('Error al crear partido:', error);
    res.status(400).json({ error: error.message || 'Error al crear partido.' });
  }
}

// Actualizar partido
export async function actualizarPartido(req, res) {
  try {
    const partido = req.partido;
    const { marcadorLocal, marcadorVisitante, estado, ...restoCampos } = req.body;
    Object.assign(partido, restoCampos);

    // Si pasan marcadores explícitos los puedes asignar (aunque igual se recalculan al guardar sets)
    if (marcadorLocal !== undefined) partido.marcadorLocal = marcadorLocal;
    if (marcadorVisitante !== undefined) partido.marcadorVisitante = marcadorVisitante;
    if (estado) partido.estado = estado;

    await partido.save();

    // Solo actualizamos participacion si el partido está finalizado y tiene fase
    if (partido.estado === 'finalizado' && partido.fase) {
      await Promise.all([
        actualizarParticipacionFase(partido.equipoLocal, partido.fase),
        actualizarParticipacionFase(partido.equipoVisitante, partido.fase),
      ]);
    }

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('sets.statsJugadoresSet.jugador', 'nombre alias')
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar partido:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar el partido.' });
  }
}

export async function agregarSet(req, res) {
  try {
    const partido = req.partido;
    const {
      numeroSet,
      ganadorSet = 'pendiente',
      estadoSet = 'en_juego',
      statsJugadoresSet = [],
    } = req.body;

    if (partido.sets.some(s => s.numeroSet === numeroSet)) {
      return res.status(400).json({ error: `El set número ${numeroSet} ya existe.` });
    }

    const nuevoSet = {
      numeroSet,
      ganadorSet,
      estadoSet,
      statsJugadoresSet,
    };

    partido.sets.push(nuevoSet);
    await partido.save();

    res.status(201).json(nuevoSet);
  } catch (error) {
    console.error('Error al agregar set:', error);
    res.status(400).json({ error: error.message || 'Error al agregar el set.' });
  }
}

export async function actualizarStatsSet(req, res) {
  try {
    const partido = req.partido;
    const { numeroSet } = req.params;
    const { statsJugadoresSet } = req.body;

    if (!Array.isArray(statsJugadoresSet)) {
      return res.status(400).json({ error: 'statsJugadoresSet debe ser un arreglo.' });
    }

    const set = partido.sets.find(s => s.numeroSet === parseInt(numeroSet));
    if (!set) return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });

    set.statsJugadoresSet = statsJugadoresSet;
    await partido.save();

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('sets.statsJugadoresSet.jugador', 'nombre alias')
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar estadísticas del set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar estadísticas del set.' });
  }
}

export async function actualizarSet(req, res) {
  try {
    const partido = req.partido; // Cargado por middleware
    const { numeroSet } = req.params;
    const { ganadorSet, estadoSet, statsJugadoresSet } = req.body;

    const set = partido.sets.find(s => s.numeroSet === parseInt(numeroSet));
    if (!set) return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });

    if (ganadorSet !== undefined) set.ganadorSet = ganadorSet;
    if (estadoSet !== undefined) set.estadoSet = estadoSet;
    if (statsJugadoresSet !== undefined) set.statsJugadoresSet = statsJugadoresSet;

    if (!partido.creadoPor && req.user?.uid) {
      partido.creadoPor = req.user.uid;
    }

    await partido.save();

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('sets.statsJugadoresSet.jugador', 'nombre alias')
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar el set.' });
  }
}

export async function eliminarSet(req, res) {
  try {
    const partido = req.partido;  // partido cargado por middleware
    const { numeroSet } = req.params;

    // Buscar índice del set
    const index = partido.sets.findIndex(s => s.numeroSet === parseInt(numeroSet));
    if (index === -1) {
      return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });
    }

    // Eliminar set por índice
    partido.sets.splice(index, 1);

    await partido.save();

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('sets.statsJugadoresSet.jugador', 'nombre alias')
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al eliminar set:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar el set.' });
  }
}

export async function eliminarPartido(req, res) {
  try {
    const partido = req.partido;
    await partido.deleteOne();
    res.json({ mensaje: 'Partido eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar partido:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar el partido.' });
  }
}