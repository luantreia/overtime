// server/controllers/partidoController.js
import Partido from '../models/Partido.js';

// Obtener todos los partidos, ordenados por fecha descendente
export async function obtenerPartidos(req, res) {
  try {
    const partidos = await Partido.find()
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
      .lean();

    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }
    res.json(partido);
  } catch (error) {
    console.error(`Error al obtener partido con ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Error al obtener el partido.' });
  }
}

// Crear un nuevo partido
export async function crearPartido(req, res) {
  try {
    const {
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado = 'pendiente',
      marcadorLocal = 0,
      marcadorVisitante = 0,
      sets = []
    } = req.body;

    // Suponiendo que tenés el id del usuario en req.user._id
    const adminPartido = req.user ? req.user._id : null; // o lanzar error si no autenticado

    const nuevoPartido = new Partido({
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado,
      marcadorLocal,
      marcadorVisitante,
      sets,
      adminPartido
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

// Actualizar marcador o estado general del partido
export async function actualizarPartido(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedPartido = await Partido.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    if (!updatedPartido) {
      return res.status(404).json({ error: 'Partido no encontrado para actualizar.' });
    }
    res.json(updatedPartido);
  } catch (error) {
    console.error(`Error al actualizar partido con ID ${req.params.id}:`, error);
    res.status(400).json({ error: error.message || 'Error al actualizar el partido.' });
  }
}

// Agregar un nuevo set al partido
export async function agregarSet(req, res) {
  try {
    const { id } = req.params;
    const { numeroSet, marcadorLocalSet = 0, marcadorVisitanteSet = 0, estadoSet = 'en_juego', statsJugadoresSet = [] } = req.body;

    const partido = await Partido.findById(id);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    // Validar que numeroSet no exista aún
    if (partido.sets.some(s => s.numeroSet === numeroSet)) {
      return res.status(400).json({ error: `El set número ${numeroSet} ya existe.` });
    }

    const nuevoSet = {
      numeroSet,
      marcadorLocalSet,
      marcadorVisitanteSet,
      estadoSet,
      statsJugadoresSet
    };

    partido.sets.push(nuevoSet);
    await partido.save();

    res.status(201).json(nuevoSet);
      } catch (error) {
    console.error('Error al agregar set:', error);
    res.status(400).json({ error: error.message || 'Error al agregar el set.' });
  }
}

// Actualizar estadísticas de jugadores en un set específico
export async function actualizarStatsSet(req, res) {
  try {
    const { id, numeroSet } = req.params;
    const { statsJugadoresSet } = req.body;

    if (!Array.isArray(statsJugadoresSet)) {
      return res.status(400).json({ error: 'statsJugadoresSet debe ser un arreglo.' });
    }

    const partido = await Partido.findById(id);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    const setIndex = partido.sets.findIndex(s => s.numeroSet === parseInt(numeroSet));
    if (setIndex === -1) {
      return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });
    }

    partido.sets[setIndex].statsJugadoresSet = statsJugadoresSet;
    await partido.save();

    const updatedPartido = await Partido.findById(id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    res.json(updatedPartido);
  } catch (error) {
    console.error('Error al actualizar estadísticas del set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar estadísticas del set.' });
  }
}

// Actualizar marcador o estado de un set específico
export async function actualizarSet(req, res) {
  try {
    const { id, numeroSet } = req.params;
    const { marcadorLocalSet, marcadorVisitanteSet, estadoSet } = req.body;

    const partido = await Partido.findById(id);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    const set = partido.sets.find(s => s.numeroSet === parseInt(numeroSet));
    if (!set) {
      return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });
    }

    if (marcadorLocalSet !== undefined) set.marcadorLocalSet = marcadorLocalSet;
    if (marcadorVisitanteSet !== undefined) set.marcadorVisitanteSet = marcadorVisitanteSet;
    if (estadoSet !== undefined) set.estadoSet = estadoSet;

    await partido.save();

    const updatedPartido = await Partido.findById(id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    res.json(updatedPartido);
  } catch (error) {
    console.error('Error al actualizar set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar el set.' });
  }
}

// Eliminar un partido
export async function eliminarPartido(req, res) {
  try {
    const { id } = req.params;
    const deleted = await Partido.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Partido no encontrado para eliminar.' });
    }
    res.json({ mensaje: 'Partido eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar partido:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar el partido.' });
  }
}
