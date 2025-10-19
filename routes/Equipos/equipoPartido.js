import express from 'express';
import EquipoPartido from '../../models/Equipo/EquipoPartido.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

// ✅ GET - Obtener todos (opcionalmente filtrados por partido o equipo)
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.partido) filtro.partido = req.query.partido;
    if (req.query.equipo) filtro.equipo = req.query.equipo;

    const resultados = await EquipoPartido.find(filtro)
      .populate('partido')
      .populate('equipo')
      .populate('equipoCompetencia')
      .populate('participacionTemporada')
      .populate('participacionFase');

    res.json(resultados);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET - Obtener uno por ID
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const resultado = await EquipoPartido.findById(req.params.id)
      .populate('partido')
      .populate('equipo')
      .populate('equipoCompetencia')
      .populate('participacionTemporada')
      .populate('participacionFase');

    if (!resultado) return res.status(404).json({ message: 'No encontrado' });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ POST - Crear uno nuevo
router.post('/', verificarToken, async (req, res) => {
  try {
    const nuevo = new EquipoPartido({
      ...req.body,
      creadoPor: req.usuarioId,
    });

    const guardado = await nuevo.save();

    // Crear automáticamente estadísticas iniciales para este equipo en el partido
    try {
      const { default: EstadisticasEquipoPartido } = await import('../../models/Equipo/EstadisticasEquipoPartido.js');

      const estadisticasIniciales = new EstadisticasEquipoPartido({
        partido: req.body.partido,
        equipo: req.body.equipo,
        throws: 0,
        hits: 0,
        outs: 0,
        catches: 0,
        efectividad: 0,
        jugadores: 0,
        creadoPor: req.usuarioId,
      });

      await estadisticasIniciales.save();
      console.log('✅ EstadisticasEquipoPartido iniciales creadas para equipo:', req.body.equipo);
    } catch (statsError) {
      console.error('⚠️ Error creando estadísticas iniciales de equipo:', statsError);
      // No fallar la petición principal
    }

    res.status(201).json(guardado);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Ya existe un vínculo para ese partido y equipo' });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

// ✅ PUT - Editar uno existente
router.put('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const actualizado = await EquipoPartido.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!actualizado) return res.status(404).json({ message: 'No encontrado' });
    res.json(actualizado);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE - Eliminar uno
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const equipoPartido = await EquipoPartido.findById(req.params.id);
    if (!equipoPartido) return res.status(404).json({ message: 'No encontrado' });

    // Eliminar también las estadísticas asociadas
    try {
      const { default: EstadisticasEquipoPartido } = await import('../../models/Equipo/EstadisticasEquipoPartido.js');
      await EstadisticasEquipoPartido.deleteMany({
        partido: equipoPartido.partido,
        equipo: equipoPartido.equipo
      });
      console.log('✅ EstadisticasEquipoPartido eliminadas para equipo:', equipoPartido.equipo);
    } catch (statsError) {
      console.error('⚠️ Error eliminando estadísticas de equipo:', statsError);
      // No fallar la petición principal
    }

    await EquipoPartido.findByIdAndDelete(req.params.id);
    res.json({ message: 'Eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET - Obtener estadísticas de equipo por partido
router.get('/estadisticas/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    
    const estadisticas = await EstadisticasEquipoPartido.find({ partido: partidoId })
      .populate('equipo', 'nombre escudo')
      .populate('partido', 'nombrePartido fecha')
      .lean();

    // Formatear respuesta para incluir equipo en nivel superior
    const estadisticasFormateadas = estadisticas.map(stat => ({
      ...stat,
      equipo: stat.equipo,
      partido: stat.partido
    }));

    res.json(estadisticasFormateadas);
  } catch (err) {
    console.error('Error obteniendo estadísticas de equipo:', err);
    res.status(500).json({ message: 'Error al obtener estadísticas de equipo', error: err.message });
  }
});
