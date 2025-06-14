// server/routes/partidos.js
import express from 'express';
import Partido from '../models/Partido.js';
import Equipo from '../models/Equipo.js'; // Make sure to import your Equipo model

const router = express.Router();

// Helper function to apply common population logic
const populatePartidoQuery = (query) => {
  return query
    .populate('equipoLocal', 'nombre escudo') // Populate name and shield for local team
    .populate('equipoVisitante', 'nombre escudo'); // Populate name and shield for visitor team
    // If you add Liga as an ObjectId later, you'd add .populate('liga', 'nombre') here
};


// --- Crear partido (POST /api/partidos) ---
router.post('/', async (req, res) => {
  try {
    // Destructure specifically for the new schema fields
    const {
      liga,
      modalidad,
      categoria,
      fecha,
      equipoLocal,    // Now a separate field
      equipoVisitante, // Now a separate field
      marcadorLocal,
      marcadorVisitante,
      // Add 'goles' and 'eventos' here if you include them in the schema and frontend
    } = req.body;

    // Optional: Basic validation for required fields
    if (!liga || !modalidad || !categoria || !fecha || !equipoLocal || !equipoVisitante) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para crear el partido.' });
    }

    // Optional: Validate if provided Equipo IDs exist
    const [existingEquipoLocal, existingEquipoVisitante] = await Promise.all([
      Equipo.findById(equipoLocal),
      Equipo.findById(equipoVisitante)
    ]);

    if (!existingEquipoLocal) {
      return res.status(400).json({ error: 'El equipo local proporcionado no existe.' });
    }
    if (!existingEquipoVisitante) {
      return res.status(400).json({ error: 'El equipo visitante proporcionado no existe.' });
    }

    // Create a new Partido instance with the correct fields
    const nuevoPartido = new Partido({
      liga,
      modalidad,
      categoria,
      fecha,
      equipoLocal,
      equipoVisitante,
      marcadorLocal: marcadorLocal !== undefined ? marcadorLocal : 0,
      marcadorVisitante: marcadorVisitante !== undefined ? marcadorVisitante : 0,
    });

    await nuevoPartido.save();

    // Populate the saved partido before sending it back
    const partidoPopulado = await populatePartidoQuery(Partido.findById(nuevoPartido._id)).lean();

    res.status(201).json(partidoPopulado);
  } catch (error) {
    console.error('Error al crear partido:', error);
    res.status(400).json({ error: error.message || 'Error desconocido al crear el partido.' });
  }
});

// --- Listar partidos (GET /api/partidos) ---
router.get('/', async (req, res) => {
  try {
    // Apply population and then convert to plain JS objects
    const partidos = await populatePartidoQuery(Partido.find()).lean();
    res.json(partidos);
  } catch (error) {
    console.error('Error al obtener partidos:', error);
    res.status(500).json({ error: error.message || 'Error desconocido al obtener los partidos.' });
  }
});

// --- Get Partido by ID (GET /api/partidos/:id) ---
// Highly recommended for displaying single match details in a modal
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

// --- Update Partido (PUT /api/partidos/:id) ---
// Essential for updating scores, adding goals, etc.
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

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

// --- Delete Partido (DELETE /api/partidos/:id) ---
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPartido = await Partido.findByIdAndDelete(id);

    if (!deletedPartido) {
      return res.status(404).json({ error: 'Partido no encontrado para eliminar.' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(`Error al eliminar partido con ID ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Error desconocido al eliminar el partido.' });
  }
});

export default router;