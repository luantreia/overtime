import express from 'express';
import EquipoCompetencia from '../../models/Equipo/EquipoCompetencia.js';
import Equipo from '../../models/Equipo/Equipo.js';
import Competencia from '../../models/Competencia/Competencia.js';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import Temporada from '../../models/Competencia/Temporada.js';
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
 * /api/equipos-competencia/opciones:
 *   get:
 *     summary: Opciones de equipos para una competencia
 *     description: Lista equipos disponibles para crear vínculo equipo-competencia, basados en ParticipacionTemporada de cualquiera de las temporadas de la competencia. Excluye equipos que ya tienen vínculo aceptado con la competencia.
 *     tags: [EquiposCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: competencia
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Filtro por nombre/tipo/pais del equipo
 *     responses:
 *       200:
 *         description: Lista de opciones
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const { competencia, q } = req.query;
    if (!competencia || !mongoose.Types.ObjectId.isValid(competencia)) {
      return res.status(400).json({ message: 'competencia inválida' });
    }

    const comp = await Competencia.findById(competencia).select('_id nombre');
    if (!comp) return res.status(404).json({ message: 'Competencia no encontrada' });

    const temps = await Temporada.find({ competencia }).select('_id').lean();
    const tempIds = temps.map(t => t._id);

    const pts = await ParticipacionTemporada.find({ temporada: { $in: tempIds } })
      .populate('equipo', 'nombre escudo tipo pais')
      .lean();

    const equipoIdsDesdePT = new Set(pts.map(pt => pt.equipo?._id?.toString()).filter(Boolean));

    // Excluir equipos que ya tengan vínculo aceptado con la competencia
    const existentes = await EquipoCompetencia.find({ competencia, estado: 'aceptado' }).select('equipo').lean();
    const yaVinculados = new Set(existentes.map(ec => ec.equipo?.toString()));

    let opciones = [];
    for (const id of equipoIdsDesdePT) {
      if (!yaVinculados.has(id)) {
        const e = pts.find(pt => pt.equipo?._id?.toString() === id)?.equipo;
        if (e) opciones.push({ _id: e._id, nombre: e.nombre, tipo: e.tipo, pais: e.pais, escudo: e.escudo });
      }
    }

    if (q) {
      const regex = new RegExp(q, 'i');
      opciones = opciones.filter(o => regex.test(o.nombre) || regex.test(o.tipo || '') || regex.test(o.pais || ''));
    }

    opciones.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return res.json(opciones);
  } catch (error) {
    console.error('Error en GET /equipos-competencia/opciones:', error);
    res.status(500).json({ message: 'Error al obtener opciones', error: error.message });
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
 *         $ref: '#/components/responses/NotFound'
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
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
