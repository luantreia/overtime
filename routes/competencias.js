import express from 'express';
import Competencia from '../models/Competencia.js';
import verificarToken from '../middlewares/authMiddleware.js';
import Organizacion from '../models/Organizacion.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import { verificarEntidad } from '../middlewares/verificarEntidad.js';
import Usuario from '../models/Usuario.js';

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

// GET /competencias/admin - competencias que el usuario puede administrar
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let competencias;

    if (rol === 'admin') {
      competencias = await Competencia.find({}, 'nombre _id').lean();
    } else {
      competencias = await Competencia.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id').lean();
    }

    res.status(200).json(competencias);
  } catch (error) {
    console.error('Error al obtener competencias administrables:', error);
    res.status(500).json({ message: 'Error al obtener competencias administrables' });
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

router.get('/:id/administradores', verificarEntidad(Competencia, 'id', 'competencia'), async (req, res) => {
  try {
    await req.competencia.populate('administradores', 'email nombre').execPopulate();
    res.status(200).json(req.competencia.administradores);
  } catch (error) {
    console.error('Error al obtener administradores:', error);
    res.status(500).json({ message: 'Error al obtener administradores' });
  }
});

router.post('/:id/administradores', verificarToken, cargarRolDesdeBD, verificarEntidad(Competencia, 'id', 'competencia'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const competencia = req.competencia;
    const { adminUid, email } = req.body;

    if (!adminUid && !email) {
      return res.status(400).json({ message: 'Se requiere adminUid o email' });
    }

    let usuarioAdminId = adminUid;

    // Si mandan un email, buscamos el UID correspondiente
    if (email && !adminUid) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
      usuarioAdminId = usuario._id.toString();
    }

    const esAdmin = competencia.creadoPor?.toString() === uid || (competencia.administradores || []).some(a => a.toString() === uid);
    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    if (!competencia.administradores.includes(usuarioAdminId)) {
      competencia.administradores.push(usuarioAdminId);
      await competencia.save();
    }

    await competencia.populate('administradores', 'email nombre').execPopulate();
    res.status(200).json(competencia.administradores);
  } catch (error) {
    console.error('Error al agregar administrador:', error);
    res.status(500).json({ message: 'Error al agregar administrador' });
  }
});

router.delete('/:id/administradores/:adminUid', verificarToken, cargarRolDesdeBD, verificarEntidad(Competencia, 'id', 'competencia'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const competencia = req.competencia;
    const { adminUid } = req.params;

    const esAdmin = competencia.creadoPor?.toString() === uid || (competencia.administradores || []).some(a => a.toString() === uid);
    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    competencia.administradores = competencia.administradores.filter(a => a.toString() !== adminUid);
    await competencia.save();

    await competencia.populate('administradores', 'email nombre').execPopulate();
    res.status(200).json(competencia.administradores);
  } catch (error) {
    console.error('Error al quitar administrador:', error);
    res.status(500).json({ message: 'Error al quitar administrador' });
  }
});

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
