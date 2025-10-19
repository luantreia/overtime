import express from 'express';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';

const router = express.Router();

// GET /api/jugador-partido?partido=...&equipo=...
router.get('/', async (req, res) => {
  try {
    const { partido, equipo } = req.query;
    const filtro = {};
    if (partido) filtro.partido = partido;
    if (equipo) filtro.equipo = equipo;

    const items = await JugadorPartido.find(filtro)
      .populate({
        path: 'jugadorTemporada',
        populate: {
          path: 'jugadorEquipo',
          populate: {
            path: 'jugador',
            select: 'nombre alias foto',
          },
        },
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error en GET jugador-partido:', err);
    res.status(500).json({ error: 'Error al obtener jugadores del partido' });
  }
});

// POST
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const nuevo = new JugadorPartido({
      ...req.body,
      creadoPor: req.user.uid,
    });

    const guardado = await nuevo.save();

    // Crear automáticamente estadísticas iniciales para este jugador en el partido
    try {
      const { default: EstadisticasJugadorPartido } = await import('../../models/Jugador/EstadisticasJugadorPartido.js');

      const estadisticasIniciales = new EstadisticasJugadorPartido({
        jugadorPartido: guardado._id,
        throws: 0,
        hits: 0,
        outs: 0,
        catches: 0,
        creadoPor: req.user.uid,
      });

      await estadisticasIniciales.save();
      console.log('✅ EstadisticasJugadorPartido iniciales creadas para jugador:', guardado._id);
    } catch (statsError) {
      console.error('⚠️ Error creando estadísticas iniciales:', statsError);
      // No fallar la petición principal
    }

    res.status(201).json(guardado);
  } catch (err) {
    console.error('Error en POST jugador-partido:', err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /:id
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorPartido.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorPartido.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    // Eliminar también las estadísticas asociadas
    try {
      const { default: EstadisticasJugadorPartido } = await import('../../models/Jugador/EstadisticasJugadorPartido.js');
      await EstadisticasJugadorPartido.deleteMany({ jugadorPartido: req.params.id });
      console.log('✅ EstadisticasJugadorPartido eliminadas para jugador:', req.params.id);
    } catch (statsError) {
      console.error('⚠️ Error eliminando estadísticas:', statsError);
      // No fallar la petición principal
    }

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
