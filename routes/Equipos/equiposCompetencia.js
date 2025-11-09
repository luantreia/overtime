import express from 'express';
import EquipoCompetencia from '../../models/Equipo/EquipoCompetencia.js';
import Equipo from '../../models/Equipo/Equipo.js';
import Competencia from '../../models/Competencia/Competencia.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import mongoose from 'mongoose';

const router = express.Router();

async function esAdminEquipoOCompetenciaSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const rol = req.user.rol;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const relacion = await EquipoCompetencia.findById(id);
  if (!relacion) return res.status(404).json({ message: 'Relación no encontrada' });

  const [equipo, competencia] = await Promise.all([
    Equipo.findById(relacion.equipo),
    Competencia.findById(relacion.competencia),
  ]);

  if (!equipo || !competencia) return res.status(404).json({ message: 'Equipo o competencia no encontrados' });

  const esAdminEquipo =
    equipo.creadoPor?.toString() === usuarioId || (equipo.administradores || []).map(String).includes(usuarioId) || rol === 'admin';

  const esAdminCompetencia =
    competencia.creadoPor?.toString() === usuarioId || (competencia.administradores || []).map(String).includes(usuarioId) || rol === 'admin';

  const esSolicitante = relacion.solicitadoPor?.toString() === usuarioId;

  if (!esAdminEquipo && !esAdminCompetencia && !esSolicitante) {
    return res.status(403).json({ message: 'No tienes permisos para modificar esta relación' });
  }

  req.relacion = relacion;
  req.equipo = equipo;
  req.competencia = competencia;
  next();
}

function fueHechaPorEquipo(relacion, equipo) {
  const solicitante = relacion.solicitadoPor?.toString();
  return equipo.creadoPor.toString() === solicitante || (equipo.administradores || []).map(String).includes(solicitante);
}

// Obtener todos los equipos de competencia (filtros opcionales)
/**
 * @swagger
 * /api/equipos-competencia:
 *   get:
 *     summary: Lista vínculos equipo-competencia
 *     tags: [EquiposCompetencia]
 *     parameters:
 *       - in: query
 *         name: competencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: fase
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de vínculos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EquipoCompetencia'
 *       500:
 *         description: Error al obtener equipos de competencia
 */
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

/**
 * @swagger
 * /api/equipos-competencia/solicitar-equipo:
 *   post:
 *     summary: Crea solicitud de equipo para ingresar a una competencia
 *     description: Solo administradores del equipo pueden realizar esta acción.
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipo, competencia]
 *             properties:
 *               equipo:
 *                 type: string
 *                 format: ObjectId
 *               competencia:
 *                 type: string
 *                 format: ObjectId
 *     responses:
 *       201:
 *         description: Solicitud creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EquipoCompetencia'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido
 *       404:
 *         description: Equipo o competencia no encontrados
 *       409:
 *         description: Solicitud o vínculo ya existente
 *       500:
 *         description: Error al crear solicitud
 */
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
      estado: { $in: ['baja', 'aceptado'] },
    });

    if (existe) return res.status(409).json({ message: 'Ya existe una solicitud o vínculo activo' });

    const solicitud = new EquipoCompetencia({
      equipo,
      competencia,
      estado: 'aceptado',
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

/**
 * @swagger
 * /api/equipos-competencia/solicitar-competencia:
 *   post:
 *     summary: Crea solicitud de competencia para invitar a un equipo
 *     description: Solo administradores de la competencia pueden realizar esta acción.
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipo, competencia]
 *             properties:
 *               equipo:
 *                 type: string
 *                 format: ObjectId
 *               competencia:
 *                 type: string
 *                 format: ObjectId
 *     responses:
 *       201:
 *         description: Solicitud creada
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido
 *       404:
 *         description: Equipo o competencia no encontrados
 *       409:
 *         description: Solicitud o vínculo ya existente
 *       500:
 *         description: Error al crear solicitud
 */
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

/**
 * @swagger
 * /api/equipos-competencia/solicitudes:
 *   get:
 *     summary: Lista solicitudes equipo-competencia
 *     description: Filtra por estado, equipo o competencia y limita por permisos del usuario.
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, aceptado, rechazado, cancelado, finalizado]
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: competencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de solicitudes
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/solicitudes', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const usuarioId = req.user.uid;
    const rol = req.user.rol;
    const { estado, equipo, competencia } = req.query;

    // Construir filtro base
    const filtro = {
      ...(estado ? { estado } : { estado: 'pendiente' }),
      ...(equipo ? { equipo } : {}),
      ...(competencia ? { competencia } : {}),
    };

    const solicitudes = await EquipoCompetencia.find(filtro)
      .populate('equipo', 'nombre creadoPor administradores')
      .populate('competencia', 'nombre creadoPor administradores')
      .lean();

    console.log('Solicitudes recibidas:', solicitudes.length);

    // Filtrar por permisos (opcional si ya limitás por equipo/competencia)
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
    console.error('Error en GET /solicitudes:', error);
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});


// Obtener equipo competencia por ID
/**
 * @swagger
 * /api/equipos-competencia/{id}:
 *   get:
 *     summary: Obtiene un vínculo equipo-competencia por ID
 *     tags: [EquiposCompetencia]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Vínculo obtenido
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
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

// Actualizar equipo competencia (solo admins o creadores)
/**
 * @swagger
 * /api/equipos-competencia/{id}:
 *   put:
 *     summary: Actualiza una solicitud o contrato equipo-competencia
 *     description: Permite aceptar/rechazar/cancelar solicitudes o editar contratos activos/finalizados.
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [pendiente, aceptado, rechazado, cancelado, finalizado]
 *               motivoRechazo:
 *                 type: string
 *               desde:
 *                 type: string
 *                 format: date
 *               hasta:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Actualizado
 *       400:
 *         description: Estado inválido o no editable
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminEquipoOCompetenciaSolicitante,
  async (req, res) => {
    try {
      const { estado, motivoRechazo, desde, hasta } = req.body;
      const relacion = req.relacion;
      const usuarioId = req.user.uid;
      const rol = req.user.rol;

      const estadoPrevio = relacion.estado;
      const estadosValidos = ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'];
      
      if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido' });
      }

      const fueEquipo = fueHechaPorEquipo(relacion, req.equipo);

      const esAdminEquipo = req.equipo.creadoPor.toString() === usuarioId || (req.equipo.administradores || []).map(String).includes(usuarioId) || rol === 'admin';
      const esAdminCompetencia = req.competencia.creadoPor.toString() === usuarioId || (req.competencia.administradores || []).map(String).includes(usuarioId) || rol === 'admin';

      // Cambios sobre solicitudes pendientes
      if (estadoPrevio === 'pendiente') {
        if (estado === 'aceptado') {
          if ((fueEquipo && !esAdminCompetencia) || (!fueEquipo && !esAdminEquipo)) {
            return res.status(403).json({ message: 'No autorizado para aceptar solicitud' });
          }

          // Verificar que no exista otro contrato activo igual
          const yaActivo = await EquipoCompetencia.findOne({
            equipo: relacion.equipo,
            competencia: relacion.competencia,
            estado: 'aceptado',
            _id: { $ne: relacion._id },
          });

          if (yaActivo) return res.status(400).json({ message: 'Ya hay un contrato activo entre este equipo y competencia' });

          relacion.estado = 'aceptado';
          relacion.activo = true;
          relacion.fechaAceptacion = new Date();
          await relacion.save();
          return res.status(200).json(relacion);
        }

        if (['rechazado', 'cancelado'].includes(estado)) {
          if (motivoRechazo) relacion.motivoRechazo = motivoRechazo;
          await relacion.save();
          await EquipoCompetencia.findByIdAndDelete(relacion._id);
          return res.status(200).json({ message: 'Solicitud eliminada por rechazo o cancelación' });
        }
      }

      // Edición de contratos activos o finalizados
      if (['aceptado', 'finalizado'].includes(estadoPrevio)) {
        if (!esAdminEquipo && !esAdminCompetencia) {
          return res.status(403).json({ message: 'No autorizado para editar contrato' });
        }

        if (desde !== undefined) relacion.desde = desde;
        if (hasta !== undefined) relacion.hasta = hasta;

        await relacion.save();
        return res.status(200).json(relacion);
      }

      return res.status(400).json({ message: 'No se puede editar esta relación en su estado actual' });
    } catch (error) {
      console.error('Error al actualizar equipo competencia:', error);
      res.status(500).json({ message: 'Error al actualizar solicitud o contrato', error: error.message });
    }
  }
);

// Eliminar equipo competencia (solo admins o creadores)
/**
 * @swagger
 * /api/equipos-competencia/{id}:
 *   delete:
 *     summary: Elimina una solicitud/relación equipo-competencia (no activa)
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Eliminado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido si es contrato activo
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminEquipoOCompetenciaSolicitante,
  async (req, res) => {
    try {
      if (req.relacion.estado === 'aceptado') {
        return res.status(403).json({ message: 'No se puede eliminar un contrato activo. Marcar como finalizado.' });
      }

      await EquipoCompetencia.findByIdAndDelete(req.relacion._id);
      res.status(200).json({ message: 'Relación eliminada correctamente' });
    } catch (error) {
      console.error('Error al eliminar relación:', error);
      res.status(500).json({ message: 'Error al eliminar relación', error: error.message });
    }
  }
);


export default router;
