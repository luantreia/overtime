import express from 'express';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import Organizacion from '../models/Organizacion.js';

const router = express.Router();

// Crear organización (usuario autenticado)
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { nombre, descripcion } = req.body;

      const creadoPor = req.user.uid;
      if (!creadoPor) return res.status(401).json({ error: 'No autenticado.' });
      if (!nombre?.trim()) {
        return res.status(400).json({ error: 'El nombre de la organización es obligatorio.' });
      }
      const nueva = new Organizacion({
        nombre,
        descripcion,
        creadoPor,
        administradores: [creadoPor],
      });
      const guardada = await nueva.save();
      res.status(201).json(guardada);
    } catch (e) {
      res.status(400).json({ message: 'Error al crear organización', error: e.message });
    }
  }
);

// Listar todas las organizaciones (público)
router.get('/', async (req, res) => {
  try {
    const organizaciones = await Organizacion.find().sort({ nombre: 1 }).lean();
    res.json(organizaciones);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener organizaciones' });
  }
});

// Obtener organización por ID (público)
router.get(
  '/:id',
  validarObjectId,
  async (req, res) => {
    try {
      const org = await Organizacion.findById(req.params.id).lean();
      if (!org) return res.status(404).json({ message: 'Organización no encontrada' });
      res.json(org);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener organización' });
    }
  }
);

// Actualizar organización (solo admins o creador)
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Organizacion, 'organizacion'),
  async (req, res) => {
    try {
      const camposPermitidos = (({ nombre, descripcion, logo, sitioWeb, activa }) => ({ nombre, descripcion, logo, sitioWeb, activa }))(req.body);
      Object.assign(req.organizacion, camposPermitidos);
      const orgActualizada = await req.organizacion.save();
      res.json(orgActualizada);
    } catch (error) {
      res.status(400).json({ message: 'Error al actualizar organización', error: error.message });
    }
  }
);

// Eliminar organización (solo admins o creador)
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Organizacion, 'organizacion'),
  async (req, res) => {
    try {
      await req.organizacion.deleteOne();
      res.json({ message: 'Organización eliminada' });
    } catch (error) {
      res.status(500).json({ message: 'Error al eliminar organización', error: error.message });
    }
  }
);

export default router;
