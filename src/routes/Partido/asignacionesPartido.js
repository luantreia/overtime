import express from 'express';
import mongoose from 'mongoose';
import AsignacionPartido from '../../models/Partido/AsignacionPartido.js';
import Partido from '../../models/Partido/Partido.js';
import Usuario from '../../models/Usuario.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { hasCompetenciaPermission, getCompetenciaIdFromFase } from '../../services/competenciaPermissionService.js';
import { getAsignacionesVigentes } from '../../services/matchPermissionService.js';
import {
  MATCH_MEMBER_ROLE_VALUES,
  MATCH_PERMISSION_VALUES,
  MATCH_ROLE_PERMISSION_PRESETS,
} from '../../constants/matchPermissions.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: AsignacionPartido
 *   description: Habilita planilleros, árbitros y mesa sobre partidos o fases puntuales
 */

/** Solo quien gestiona la competencia dueña del partido/fase puede repartir estas asignaciones. */
async function puedeAsignar(req, { partidoId, faseId }) {
  let competenciaId = null;

  if (faseId) {
    competenciaId = await getCompetenciaIdFromFase(faseId);
  } else if (partidoId && mongoose.Types.ObjectId.isValid(partidoId)) {
    const partido = await Partido.findById(partidoId).select('competencia fase').lean();
    if (!partido) return { ok: false, motivo: 'Partido no encontrado', status: 404 };
    competenciaId = partido.competencia
      ? String(partido.competencia)
      : await getCompetenciaIdFromFase(partido.fase);
  }

  if (!competenciaId) {
    return { ok: false, motivo: 'El partido no pertenece a ninguna competencia', status: 400 };
  }

  const ok = await hasCompetenciaPermission({
    competenciaId,
    usuarioId: req.user?.uid,
    rolGlobal: req.user?.rol,
    permission: 'matches.approve',
  });

  return ok ? { ok: true, competenciaId } : { ok: false, motivo: 'No tenés permisos sobre esta competencia', status: 403 };
}

/**
 * @swagger
 * /api/asignaciones-partido/roles:
 *   get:
 *     summary: Roles disponibles y qué permisos trae cada uno
 *     tags: [AsignacionPartido]
 */
router.get('/roles', (req, res) => {
  res.json({
    roles: MATCH_MEMBER_ROLE_VALUES,
    permisos: MATCH_PERMISSION_VALUES,
    presets: MATCH_ROLE_PERMISSION_PRESETS,
  });
});

/**
 * @swagger
 * /api/asignaciones-partido/mias:
 *   get:
 *     summary: Asignaciones vigentes del usuario autenticado
 *     tags: [AsignacionPartido]
 *     security:
 *       - bearerAuth: []
 */
router.get('/mias', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const asignaciones = await getAsignacionesVigentes(req.user.uid);
    res.json(asignaciones);
  } catch (error) {
    console.error('Error al listar asignaciones propias:', error);
    res.status(500).json({ error: 'Error al obtener tus asignaciones' });
  }
});

/**
 * @swagger
 * /api/asignaciones-partido:
 *   get:
 *     summary: Lista asignaciones por partido o por fase
 *     tags: [AsignacionPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema: { type: string, format: ObjectId }
 *       - in: query
 *         name: fase
 *         schema: { type: string, format: ObjectId }
 */
router.get('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { partido, fase } = req.query;
    if (!partido && !fase) {
      return res.status(400).json({ error: 'Indicá partido o fase' });
    }

    const permiso = await puedeAsignar(req, { partidoId: partido, faseId: fase });
    if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.motivo });

    const filtro = {};
    if (partido) filtro.partido = partido;
    if (fase) filtro.fase = fase;

    const asignaciones = await AsignacionPartido.find(filtro).sort({ createdAt: -1 }).lean();
    res.json(asignaciones);
  } catch (error) {
    console.error('Error al listar asignaciones:', error);
    res.status(500).json({ error: 'Error al obtener asignaciones' });
  }
});

/**
 * @swagger
 * /api/asignaciones-partido:
 *   post:
 *     summary: Asigna a alguien como planillero/árbitro/mesa en un partido o en una fase
 *     tags: [AsignacionPartido]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { usuarioId, email, partido, fase, rol, permisos, desde, hasta, notas } = req.body;

    if (!partido && !fase) return res.status(400).json({ error: 'Indicá partido o fase' });
    if (partido && fase) return res.status(400).json({ error: 'Indicá partido o fase, no ambos' });
    if (!rol) return res.status(400).json({ error: 'El rol es obligatorio' });

    const permiso = await puedeAsignar(req, { partidoId: partido, faseId: fase });
    if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.motivo });

    // Se puede asignar por id de usuario o por email, que es lo práctico en la cancha.
    let destinatarioId = usuarioId;
    if (!destinatarioId && email) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) return res.status(404).json({ error: 'No hay ningún usuario con ese email' });
      destinatarioId = String(usuario._id);
    }
    if (!destinatarioId) return res.status(400).json({ error: 'Indicá usuarioId o email' });

    const yaExiste = await AsignacionPartido.findOne({
      usuarioId: destinatarioId,
      estado: 'activa',
      ...(partido ? { partido } : { fase }),
    });
    if (yaExiste) return res.status(400).json({ error: 'Esa persona ya tiene una asignación activa acá' });

    const asignacion = new AsignacionPartido({
      usuarioId: destinatarioId,
      partido: partido || undefined,
      fase: fase || undefined,
      rol,
      permisos: permisos || [],
      desde: desde || undefined,
      hasta: hasta || undefined,
      notas,
      creadoPor: req.user.uid,
    });

    const guardada = await asignacion.save();
    res.status(201).json(guardada);
  } catch (error) {
    console.error('Error al crear asignación:', error);
    res.status(400).json({ error: error.message || 'Error al crear la asignación' });
  }
});

/**
 * @swagger
 * /api/asignaciones-partido/{id}:
 *   put:
 *     summary: Edita una asignación (rol, permisos, ventana de validez, estado)
 *     tags: [AsignacionPartido]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const asignacion = await AsignacionPartido.findById(req.params.id);
    if (!asignacion) return res.status(404).json({ error: 'Asignación no encontrada' });

    const permiso = await puedeAsignar(req, {
      partidoId: asignacion.partido ? String(asignacion.partido) : null,
      faseId: asignacion.fase ? String(asignacion.fase) : null,
    });
    if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.motivo });

    const { rol, permisos, estado, desde, hasta, notas } = req.body;
    if (rol !== undefined) asignacion.rol = rol;
    if (permisos !== undefined) asignacion.permisos = permisos;
    if (estado !== undefined) asignacion.estado = estado;
    if (desde !== undefined) asignacion.desde = desde;
    if (hasta !== undefined) asignacion.hasta = hasta;
    if (notas !== undefined) asignacion.notas = notas;
    asignacion.actualizadoPor = req.user.uid;

    const actualizada = await asignacion.save();
    res.json(actualizada);
  } catch (error) {
    console.error('Error al actualizar asignación:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar la asignación' });
  }
});

/**
 * @swagger
 * /api/asignaciones-partido/{id}:
 *   delete:
 *     summary: Revoca una asignación
 *     tags: [AsignacionPartido]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const asignacion = await AsignacionPartido.findById(req.params.id);
    if (!asignacion) return res.status(404).json({ error: 'Asignación no encontrada' });

    const permiso = await puedeAsignar(req, {
      partidoId: asignacion.partido ? String(asignacion.partido) : null,
      faseId: asignacion.fase ? String(asignacion.fase) : null,
    });
    if (!permiso.ok) return res.status(permiso.status).json({ error: permiso.motivo });

    await asignacion.deleteOne();
    res.json({ mensaje: 'Asignación revocada' });
  } catch (error) {
    console.error('Error al revocar asignación:', error);
    res.status(500).json({ error: 'Error al revocar la asignación' });
  }
});

export default router;
