import express from 'express';
import Competencia from '../models/Competencia.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// Obtener todas las competencias (público)
router.get('/', async (req, res) => {
  try {
    const competencias = await Competencia.find().populate('organizacion', 'nombre').lean();
    res.json(competencias);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener competencias' });
  }
});

// Obtener competencia por ID (público)
router.get(
  '/:id',
  validarObjectId,
  async (req, res) => {
    try {
      const competencia = await Competencia.findById(req.params.id).populate('organizacion', 'nombre').lean();
      if (!competencia) return res.status(404).json({ error: 'Competencia no encontrada' });
      res.json(competencia);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener la competencia' });
    }
  }
);

// Crear competencia (solo usuario autenticado)
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const nueva = new Competencia({
        ...req.body,
        creadoPor: req.user.uid,
        administradores: [req.user.uid],
      });
      const guardada = await nueva.save();
      res.status(201).json(guardada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear competencia' });
    }
  }
);

// Actualizar competencia (solo admins o creadores)
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Competencia, 'competencia'),
  async (req, res) => {
    try {
      Object.assign(req.competencia, req.body);
      const actualizada = await req.competencia.save();
      res.json(actualizada);
    } catch (error) {
      res.status(400).json({ error: 'Error al actualizar competencia' });
    }
  }
);

// Eliminar competencia (solo admins o creadores)
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Competencia, 'competencia'),
  async (req, res) => {
    try {
      await req.competencia.deleteOne();
      res.json({ mensaje: 'Competencia eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar competencia' });
    }
  }
);

export default router;
