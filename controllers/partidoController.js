// server/controllers/partidoController.js
import Partido from '../models/Partido.js';

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

export async function obtenerPartidoPorId(req, res) {
  try {
    const { id } = req.params;
    const partido = await Partido.findById(id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    if (!partido) return res.status(404).json({ error: 'Partido no encontrado.' });
    res.json(partido);
  } catch (error) {
    console.error(`Error al obtener partido con ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Error al obtener el partido.' });
  }
}

export async function crearPartido(req, res) {
  try {
    const {
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado = 'programado',
      modalidad,
      categoria,
      sets = []
    } = req.body;

    const creadoPor = req.user.uid;
    if (!creadoPor) return res.status(401).json({ error: 'No autenticado.' });

    const nuevoPartido = new Partido({
      equipoLocal,
      equipoVisitante,
      fecha,
      ubicacion,
      estado,
      modalidad,     // <--- agregado
      categoria,     // <--- agregado
      sets,
      creadoPor,
      administradores: [creadoPor]
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


export async function actualizarPartido(req, res) {
  try {
    const partido = req.partido;
    const { marcadorLocal, marcadorVisitante, ...restoCampos } = req.body;
    Object.assign(partido, restoCampos);
    await partido.save();

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
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
    const { numeroSet, marcadorLocalSet = 0, marcadorVisitanteSet = 0, estadoSet = 'en_juego', statsJugadoresSet = [] } = req.body;

    if (partido.sets.some(s => s.numeroSet === numeroSet)) {
      return res.status(400).json({ error: `El set número ${numeroSet} ya existe.` });
    }

    const nuevoSet = { numeroSet, marcadorLocalSet, marcadorVisitanteSet, estadoSet, statsJugadoresSet };
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
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar estadísticas del set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar estadísticas del set.' });
  }
}

export async function actualizarSet(req, res) {
  try {
    const partido = req.partido;
    const { numeroSet } = req.params;
    const { marcadorLocalSet, marcadorVisitanteSet, estadoSet, statsJugadoresSet } = req.body;

    const set = partido.sets.find(s => s.numeroSet === parseInt(numeroSet));
    if (!set) return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });

    if (marcadorLocalSet !== undefined) set.marcadorLocalSet = marcadorLocalSet;
    if (marcadorVisitanteSet !== undefined) set.marcadorVisitanteSet = marcadorVisitanteSet;
    if (estadoSet !== undefined) set.estadoSet = estadoSet;
    if (statsJugadoresSet !== undefined) set.statsJugadoresSet = statsJugadoresSet;

    await partido.save();

    const actualizado = await Partido.findById(partido._id)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar set:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar el set.' });
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
