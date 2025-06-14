// server/routes/partidos.js
import express from 'express';
import Partido from '../models/Partido.js';
import Equipo from '../models/Equipo.js';
import Jugador from '../models/Jugador.js';

const router = express.Router();

// Helper para poblar datos comunes del partido
const populatePartidoQuery = (query) => {
  return query
    .populate('equipoLocal', 'nombre escudo')
    .populate('equipoVisitante', 'nombre escudo')
    // Poblar jugador y equipo dentro de cada statsJugadoresSet dentro de cada set
    .populate('sets.statsJugadoresSet.jugador', 'nombre')
    .populate('sets.statsJugadoresSet.equipo', 'nombre');
};

// --- (Tus rutas POST / y GET / existentes) ---
// Asegúrate de que en el POST inicial, el arreglo 'sets' sea vacío o con el primer set sin stats.

// --- Obtener Partido por ID (GET /api/partidos/:id) ---
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const partido = await populatePartidoQuery(Partido.findById(id)).lean();

    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }
    res.json(partido);
  } catch (error) {
    console.error(`Error al obtener partido con ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Error desconocido al obtener el partido.' });
  }
});

// --- Actualizar Marcadores Generales del Partido (PUT /api/partidos/:id) ---
// Esta ruta es para actualizar marcadorLocal, marcadorVisitante o el estado general del partido.
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body; // Puede contener marcadorLocal, marcadorVisitante, estado

    const updatedPartido = await populatePartidoQuery(
      Partido.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
    ).lean();

    if (!updatedPartido) {
      return res.status(404).json({ error: 'Partido no encontrado para actualizar.' });
    }

    res.json(updatedPartido);
  } catch (error) {
    console.error(`Error al actualizar partido con ID ${req.params.id}:`, error);
    res.status(400).json({ error: error.message || 'Error desconocido al actualizar el partido.' });
  }
});
// --- Agregar un Nuevo Set a un Partido (POST /api/partidos/:id/sets) ---
router.post('/:id/sets', async (req, res) => {
  try {
    const { id } = req.params;
    const { numeroSet, marcadorLocalSet, marcadorVisitanteSet } = req.body;

    const partido = await Partido.findById(id);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    // Validación básica: asegura que el numeroSet es incremental y único
    if (partido.sets.some(s => s.numeroSet === numeroSet)) {
      return res.status(400).json({ error: `El set número ${numeroSet} ya existe.` });
    }
    if (numeroSet <= 0 || (partido.sets.length > 0 && numeroSet !== partido.sets.length + 1)) {
        return res.status(400).json({ error: 'El número de set debe ser consecutivo.' });
    }

    partido.sets.push({ numeroSet, marcadorLocalSet, marcadorVisitanteSet });
    await partido.save();

    const updatedPartido = await populatePartidoQuery(Partido.findById(partido._id)).lean();
    res.status(201).json(updatedPartido);
  } catch (error) {
    console.error('Error al agregar set:', error);
    res.status(400).json({ error: error.message || 'Error desconocido al agregar el set.' });
  }
});

// --- Actualizar Estadísticas de Jugadores para un Set Específico (PUT /api/partidos/:id/sets/:numeroSet/stats) ---
// Esta es la ruta CRÍTICA para tu necesidad. Recibe todas las stats de los jugadores para ESE set.
router.put('/:id/sets/:numeroSet/stats', async (req, res) => {
  try {
    const { id, numeroSet } = req.params;
    const { statsJugadoresSet } = req.body; // Este arreglo debe contener las stats de TODOS los jugadores para este set

    const partido = await Partido.findById(id);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    const setIndex = partido.sets.findIndex(s => s.numeroSet === parseInt(numeroSet));
    if (setIndex === -1) {
      return res.status(404).json({ error: `Set número ${numeroSet} no encontrado en este partido.` });
    }

    // Validación de que statsJugadoresSet es un arreglo
    if (!Array.isArray(statsJugadoresSet)) {
      return res.status(400).json({ error: 'statsJugadoresSet debe ser un arreglo de estadísticas de jugadores.' });
    }

    // Reemplaza el arreglo completo de stats para ese set
    partido.sets[setIndex].statsJugadoresSet = statsJugadoresSet;
    await partido.save();

    const updatedPartido = await populatePartidoQuery(Partido.findById(partido._id)).lean();
    res.json(updatedPartido);
  } catch (error) {
    console.error('Error al actualizar estadísticas del set:', error);
    res.status(400).json({ error: error.message || 'Error desconocido al actualizar estadísticas del set.' });
  }
});

// Opcional: Actualizar el estado de un set o su marcador
router.put('/:id/sets/:numeroSet', async (req, res) => {
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

    const updatedPartido = await populatePartidoQuery(Partido.findById(partido._id)).lean();
    res.json(updatedPartido);
  } catch (error) {
    console.error('Error al actualizar set:', error);
    res.status(400).json({ error: error.message || 'Error desconocido al actualizar el set.' });
  }
});

// --- (Tus rutas DELETE /:id existentes) ---

export default router;