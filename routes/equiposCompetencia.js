import express from 'express';
import EquipoCompetencia from '../models/EquipoCompetencia.js';
import Equipo from '../models/Equipo.js';
import Competencia from '../models/Competencia.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// Obtener todos los equipos de competencia (filtros opcionales)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.competencia) filter.competencia = req.query.competencia;
    if (req.query.equipo) filter.equipo = req.query.equipo;
    if (req.query.fase) filter.fase = req.query.fase;

    const equipos = await EquipoCompetencia.find(filter)
      .populate('equipo', 'nombre')
      .populate('competencia', 'nombre')
      .lean();

    res.json(equipos);
  } catch (error) {
    console.error('Error en GET /equipos-competencia:', error); // <-- IMPORTANTE para ver detalles en consola
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

router.post('/solicitar-equipo', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { equipo, competencia } = req.body;
    const usuarioId = req.user.uid;

    if (!equipo || !competencia || !mongoose.Types.ObjectId.isValid(equipo) || !mongoose.Types.ObjectId.isValid(competencia)) {
      return res.status(400).json({ message: 'Equipo y competencia válidos requeridos' });
    }

    const [equipoDB, competenciaDB] = await Promise.all([
      Equipo.findById(equipo),
      Competencia.findById(competencia),
    ]);

    if (!equipoDB || !competenciaDB) return res.status(404).json({ message: 'Equipo o competencia no encontrados' });

    const esAdminEquipo =
      equipoDB.creadoPor?.toString() === usuarioId || (equipoDB.administradores || []).includes(usuarioId) || req.user.rol === 'admin';

    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

    const existe = await EquipoCompetencia.findOne({
      equipo,
      competencia,
      estado: { $in: ['pendiente', 'aceptado'] },
    });

    if (existe) return res.status(409).json({ message: 'Ya existe una solicitud o vínculo activo' });

    const solicitud = new EquipoCompetencia({
      equipo,
      competencia,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
      origen: 'equipo',
      administradores: [usuarioId],
    });

    await solicitud.save();
    res.status(201).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

router.post('/solicitar-competencia', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { equipo, competencia } = req.body;
    const usuarioId = req.user.uid;

    if (!equipo || !competencia || !mongoose.Types.ObjectId.isValid(equipo) || !mongoose.Types.ObjectId.isValid(competencia)) {
      return res.status(400).json({ message: 'Equipo y competencia válidos requeridos' });
    }

    const [equipoDB, competenciaDB] = await Promise.all([
      Equipo.findById(equipo),
      Competencia.findById(competencia),
    ]);

    if (!equipoDB || !competenciaDB) return res.status(404).json({ message: 'Equipo o competencia no encontrados' });

    const esAdminCompetencia =
      competenciaDB.creadoPor?.toString() === usuarioId || (competenciaDB.administradores || []).includes(usuarioId) || req.user.rol === 'admin';

    if (!esAdminCompetencia) return res.status(403).json({ message: 'No autorizado' });

    const existe = await EquipoCompetencia.findOne({
      equipo,
      competencia,
      estado: { $in: ['pendiente', 'aceptado'] },
    });

    if (existe) return res.status(409).json({ message: 'Ya existe una solicitud o vínculo activo' });

    const solicitud = new EquipoCompetencia({
      equipo,
      competencia,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
      origen: 'competencia',
      administradores: [usuarioId],
    });

    await solicitud.save();
    res.status(201).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

router.get('/solicitudes', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const usuarioId = req.user.uid;
    const rol = req.user.rol;
    const { estado } = req.query;

    const filtro = estado ? { estado } : { estado: 'pendiente' };

    const solicitudes = await EquipoCompetencia.find(filtro)
      .populate('equipo', 'nombre creadoPor administradores')
      .populate('competencia', 'nombre creadoPor administradores')
      .lean();

    const solicitudesFiltradas = solicitudes.filter(s => {
      const uid = usuarioId.toString();
      const adminsEquipo = (s.equipo?.administradores || []).map(id => id?.toString?.());
      const adminsCompetencia = (s.competencia?.administradores || []).map(id => id?.toString?.());

      const esAdminEquipo = s.equipo?.creadoPor?.toString?.() === uid || adminsEquipo.includes(uid);
      const esAdminCompetencia = s.competencia?.creadoPor?.toString?.() === uid || adminsCompetencia.includes(uid);
      const esSolicitante = s.solicitadoPor?.toString?.() === uid;

      return esAdminEquipo || esAdminCompetencia || esSolicitante || rol === 'admin';
    });

    res.status(200).json(solicitudesFiltradas);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

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
      console.error('Error al actualizar equipo competencia:', error);
      res.status(400).json({ error: error.message || 'Error al actualizar equipo competencia' });
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
