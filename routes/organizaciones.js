import express from 'express';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import Organizacion from '../models/Organizacion.js';
import Usuario from '../models/Usuario.js';
import { verificarEntidad } from '../middlewares/verificarEntidad.js';

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

// Obtener organizaciones que el usuario puede administrar
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let organizaciones;

    if (rol === 'admin') {
      organizaciones = await Organizacion.find({}, 'nombre _id descripcion activa sitioWeb createdAt updatedAt').lean();
    } else {
      organizaciones = await Organizacion.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id descripcion activa sitioWeb createdAt updatedAt').lean();
    }

    res.status(200).json(organizaciones);
  } catch (error) {
    console.error('Error al obtener organizaciones administrables:', error);
    res.status(500).json({ message: 'Error al obtener organizaciones administrables' });
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

router.get(
  '/:id/administradores',
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      await req.organizacion.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: req.organizacion.administradores || [] });
    } catch (error) {
      console.error('Error al obtener administradores:', error);
      res.status(500).json({ message: 'Error al obtener administradores' });
    }
  }
);

router.post(
  '/:id/administradores',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const organizacion = req.organizacion;
      const { adminUid, email } = req.body;

      if (!adminUid && !email) {
        return res.status(400).json({ message: 'Se requiere adminUid o email' });
      }

      let usuarioAdminId = adminUid;

      if (email && !adminUid) {
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
        usuarioAdminId = usuario._id.toString();
      }

      const esAdmin =
        organizacion.creadoPor?.toString() === uid ||
        (organizacion.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (!organizacion.administradores) {
        organizacion.administradores = [];
      }

      if (!organizacion.administradores.some((a) => a.toString() === usuarioAdminId)) {
        organizacion.administradores.push(usuarioAdminId);
        await organizacion.save();
      }

      await organizacion.populate('administradores', 'email nombre');

      res.status(200).json({ administradores: organizacion.administradores });
    } catch (error) {
      console.error('Error al agregar administrador:', error);
      res.status(500).json({ message: 'Error al agregar administrador' });
    }
  }
);

router.delete(
  '/:id/administradores/:adminUid',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const organizacion = req.organizacion;
      const { adminUid } = req.params;

      const esAdmin =
        organizacion.creadoPor?.toString() === uid ||
        (organizacion.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (organizacion.administradores && organizacion.administradores.length > 0) {
        organizacion.administradores = organizacion.administradores.filter(
          (a) => a.toString() !== adminUid
        );
        await organizacion.save();
      }

      await organizacion.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: organizacion.administradores || [] });
    } catch (error) {
      console.error('Error al quitar administrador:', error);
      res.status(500).json({ message: 'Error al quitar administrador' });
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
