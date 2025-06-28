import express from 'express';
import Competencia from '../models/Competencia.js';
import verificarToken from '../middlewares/authMiddleware.js';
import Organizacion from '../models/Organizacion.js';
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
  async (req, res, next) => {
    try {
      const competencia = await Competencia.findById(req.params.id).populate('organizacion', 'nombre').lean();
      if (!competencia) return res.status(404).json({ error: 'Competencia no encontrada' });

      if (!req.user) {
        // usuario no autenticado, devuelve sin esAdmin
        return res.json({ ...competencia, esAdmin: false });
      }

      // para verificar permisos, reutilizás la lógica del middleware:
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;
      const esCreador = competencia.creadoPor?.toString() === usuarioId;
      const esAdminEntidad = competencia.administradores?.some(adminId => adminId.toString() === usuarioId);
      const esAdmin = rolGlobal === 'admin' || esCreador || esAdminEntidad;

      return res.json({ ...competencia, esAdmin });
    } catch (error) {
      next(error);
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
      const { nombre, ...datosCompetencia } = req.body;

      const organizacion = await Organizacion.findById(datosCompetencia.organizacion).lean();

      if (!organizacion) {
        return res.status(404).json({ error: 'Organización no encontrada' });
      }

      const esAdminGlobal = req.user.rol === 'admin';
      const esAdminOrganizacion = organizacion.administradores?.includes(req.user.uid);

      if (!esAdminGlobal && !esAdminOrganizacion) {
        return res.status(403).json({ error: 'No tienes permisos para crear una competencia en esta organización' });
      }

      const nueva = new Competencia({
        ...datosCompetencia,
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
