import express from 'express';
import EquipoCompetencia from '../models/EquipoCompetencia.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// Obtener todos los equipos de competencia (filtros opcionales)
// GET /equipos-competencia?competencia=competenciaId
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.competencia) filter.competencia = req.query.competencia;
    if (req.query.equipo) filter.equipo = req.query.equipo;

    const equipos = await EquipoCompetencia.find(filter)
      .populate('equipo', 'nombre')
      .populate('competencia', 'nombre')
      .lean();

    res.json(equipos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener equipos de competencia' });
  }
});

// GET /equipos-competencia?competencia=...&fase=...
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.competencia) filter.competencia = req.query.competencia;
    if (req.query.equipo) filter.equipo = req.query.equipo;
    if (req.query.fase) filter.fase = req.query.fase; // ✅ Nuevo filtro por fase

    const equipos = await EquipoCompetencia.find(filter)
      .populate('equipo', 'nombre')
      .populate('competencia', 'nombre')
      .lean();

    res.json(equipos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener equipos de competencia' });
  }
});

// Obtener equipo competencia por ID
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const equipoCompetencia = await EquipoCompetencia.findById(req.params.id)
      .populate('equipo', 'nombre')
      .populate('competencia', 'nombre')
      .lean();

    if (!equipoCompetencia) return res.status(404).json({ error: 'Equipo de competencia no encontrado' });
    res.json(equipoCompetencia);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener equipo de competencia' });
  }
});

// Crear equipo competencia (usuario autenticado)
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      // Validar que competencia y equipo existan
      if (!req.body.competencia || !req.body.equipo) {
        return res.status(400).json({ error: 'Se requieren competencia y equipo para crear equipoCompetencia' });
      }

      // Idealmente validar permisos en competencia o equipo

      const nuevoEquipoCompetencia = new EquipoCompetencia({
        ...req.body,
        creadoPor: req.user.uid,
        administradores: [req.user.uid],
      });

      const guardado = await nuevoEquipoCompetencia.save();
      res.status(201).json(guardado);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear equipo competencia' });
    }
  }
);

// Actualizar equipo competencia (solo admins o creadores)
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(EquipoCompetencia, 'equipoCompetencia'),
  async (req, res) => {
    try {
      Object.assign(req.equipoCompetencia, req.body);
      const actualizado = await req.equipoCompetencia.save();
      res.json(actualizado);
    } catch (error) {
      res.status(400).json({ error: 'Error al actualizar equipo competencia' });
    }
  }
);

// Eliminar equipo competencia (solo admins o creadores)
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(EquipoCompetencia, 'equipoCompetencia'),
  async (req, res) => {
    try {
      await req.equipoCompetencia.deleteOne();
      res.json({ mensaje: 'Equipo competencia eliminado correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar equipo competencia' });
    }
  }
);

export default router;
