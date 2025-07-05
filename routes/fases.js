import express from 'express';
import Fase from '../models/Fase.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// Obtener todas las fases (opcionalmente filtrar por competencia)
// GET /fases?competencia=competenciaId
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.competencia) {
      if (!mongoose.Types.ObjectId.isValid(req.query.competencia)) {
        return res.status(400).json({ error: 'ID de competencia inválido' });
      }
      filter.competencia = req.query.competencia;
    }
    const fases = await Fase.find(filter).populate('competencia', 'nombre').lean();
    res.json(fases);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener fases' });
  }
});

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
      if (!req.body.competencia) {
        return res.status(400).json({ error: 'Se requiere competencia para crear fase' });
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
