import express from 'express';
import Fase from '../../models/Competencia/Fase.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import ParticipacionFase from '../../models/Equipo/ParticipacionFase.js';
import Partido from '../../models/Partido/Partido.js';
import { generarRoundRobinPorDivision } from '../../utils/fixtureGenerator.js';

const router = express.Router();

// Obtener todas las fases (opcionalmente filtrar por temporada)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.temporada) {
      filter.temporada = req.query.temporada;
    }

    const fases = await Fase.find(filter).populate('temporada', 'nombre').lean();
    res.json(fases);
  } catch (error) {
    console.error('Error al obtener fases:', error);
    res.status(500).json({ error: 'Error al obtener fases' });
  }
});

// Generar fixture para una fase (solo admins de la fase)
router.post(
  '/:id/generar-fixture',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Fase, 'fase'),
  async (req, res) => {
    try {
      const faseId = req.params.id;
      const fase = await Fase.findById(faseId);
      if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });

      const participaciones = await ParticipacionFase.find({ fase: faseId }).lean();

      if (participaciones.length < 2) {
        return res.status(400).json({ error: 'Se necesitan al menos 2 equipos para generar partidos' });
      }

      const datosBase = {
        fase: faseId,
        estado: 'pendiente',
        creadoPor: req.user.uid,
      };

      const partidos = generarRoundRobinPorDivision(participaciones, datosBase);

      const partidosGuardados = await Partido.insertMany(partidos);

      res.status(201).json({ mensaje: 'Fixture generado con éxito', cantidad: partidosGuardados.length });
    } catch (error) {
      console.error('Error generando fixture:', error);
      res.status(500).json({ error: 'Error al generar fixture' });
    }
  }
);

// Obtener fase por ID
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const fase = await Fase.findById(req.params.id).populate('competencia', 'nombre').lean();
    if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });
    res.json(fase);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener fase' });
  }
});

// Crear fase (usuario autenticado)
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      // Validar que competencia exista
      if (!req.body.temporada) {
        return res.status(400).json({ error: 'Se requiere temporada para crear fase' });
      }


      // Idealmente verificar que el usuario tenga permiso en la competencia
      // O usar un middleware que valide admin de competencia aquí

      const nuevaFase = new Fase({
        ...req.body,
        creadoPor: req.user.uid,
        administradores: [req.user.uid],
      });

      const guardada = await nuevaFase.save();
      res.status(201).json(guardada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear fase' });
    }
  }
);


// Actualizar fase (solo admins o creadores)
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Fase, 'fase'),
  async (req, res) => {
    try {
      Object.assign(req.fase, req.body);
      const actualizada = await req.fase.save();
      res.json(actualizada);
    } catch (error) {
      res.status(400).json({ error: 'Error al actualizar fase' });
    }
  }
);

// Eliminar fase (solo admins o creadores)
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Fase, 'fase'),
  async (req, res) => {
    try {
      await req.fase.deleteOne();
      res.json({ mensaje: 'Fase eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar fase' });
    }
  }
);

export default router;
