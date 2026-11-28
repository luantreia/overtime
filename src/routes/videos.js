import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import Video from '../models/Video/Video.js';
import CanalTv from '../models/Video/CanalTv.js';
import Partido from '../models/Partido/Partido.js';
import Competencia from '../models/Competencia/Competencia.js';
import { hasCompetenciaPermission } from '../services/competenciaPermissionService.js';
import { hasMatchPermission } from '../services/matchPermissionService.js';
import { extraerYoutubeId, extraerInicio } from '../services/duracionYoutubeService.js';
import { completarDuracionesDeVideos, completarDuracionesEnSegundoPlano } from '../services/duracionesPartidoService.js';
import { agregarCamaras, moverVideo, eliminarVideo, hacerPrincipal, proyectarEnPartido } from '../services/videoCatalogoService.js';

/**
 * Catálogo de videos (models/Video/Video.js).
 *
 * - Super Admin: todo el catálogo (lo usa la página de TV de Overtime-Admin).
 * - Organizaciones: los videos de una competencia, con el permiso `match.resultado` sobre ella
 *   (el mismo que editar el video de un partido). Sin aprobación: lo que cargan sale directo.
 *
 * Cargar o mover un video de un partido rearma `Partido.videos` / `videoUrl` (proyección).
 */
const router = express.Router();
const esId = (v) => mongoose.Types.ObjectId.isValid(v);
const esAdmin = (req) => String(req.user?.rol || '').toLowerCase() === 'admin';

const conErrores = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    if (err.code === 11000) return res.status(409).json({ error: 'Ese partido ya tiene este video' });
    console.error('[videos]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/** ¿Puede tocar videos de esta competencia / este partido? */
async function puedeEditar(req, { competencia, partido }) {
  if (esAdmin(req)) return true;
  const usuarioId = req.user?.uid;
  if (competencia) return hasCompetenciaPermission({ competenciaId: String(competencia), usuarioId, rolGlobal: req.user?.rol, permission: 'match.resultado' });
  if (partido) return hasMatchPermission({ partidoId: String(partido), usuarioId, rolGlobal: req.user?.rol, permission: 'match.resultado' });
  return false; // Un video suelto sin competencia es sólo del Super Admin.
}

const POBLAR = [
  { path: 'partido', select: 'fecha equipoLocal equipoVisitante marcadorLocal marcadorVisitante fase nombrePartido', populate: [{ path: 'equipoLocal', select: 'nombre escudo' }, { path: 'equipoVisitante', select: 'nombre escudo' }, { path: 'fase', select: 'nombre' }] },
  { path: 'competencia', select: 'nombre' },
  { path: 'organizacion', select: 'nombre' },
];

/**
 * @swagger
 * /api/videos:
 *   get:
 *     summary: Lista el catálogo de videos
 *     description: |
 *       Super Admin ve todo. Los demás tienen que pasar `competencia` y tener `match.resultado`.
 *       Filtros: `competencia`, `partido`, `sinPartido=true`, `enTv=true|false`, `q` (título o youtubeId), `limite` (máx. 500).
 *     tags: [Videos]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  const { competencia, partido, sinPartido, enTv, q } = req.query;
  if (competencia && !esId(competencia)) return res.status(400).json({ error: 'competencia inválida' });
  if (partido && !esId(partido)) return res.status(400).json({ error: 'partido inválido' });
  if (!esAdmin(req)) {
    if (!competencia) return res.status(400).json({ error: 'Indicá la competencia' });
    if (!(await puedeEditar(req, { competencia }))) return res.status(403).json({ error: 'No tenés permisos sobre esta competencia' });
  }
  const filtro = {};
  if (competencia) filtro.competencia = competencia;
  if (partido) filtro.partido = partido;
  if (sinPartido === 'true') filtro.partido = null;
  if (enTv === 'true' || enTv === 'false') filtro.enTv = enTv === 'true';
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filtro.$or = [{ titulo: rx }, { youtubeId: rx }, { etiqueta: rx }];
  }
  const limite = Math.min(Number(req.query.limite) || 200, 500);
  const items = await Video.find(filtro).sort({ createdAt: -1 }).limit(limite).populate(POBLAR).lean();
  res.json(items);
}));

/**
 * @swagger
 * /api/videos:
 *   post:
 *     summary: Carga un video al catálogo
 *     description: |
 *       Body: `{ url, titulo?, etiqueta?, competencia?, partido?, enTv? }`. Con `partido`, entra
 *       como su última cámara (o la principal si no tenía) y hereda la competencia del partido.
 *       Sin `partido` es un video suelto (highlights, clínicas): requiere `competencia`, salvo para Super Admin.
 *     tags: [Videos]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  const { url, titulo = '', etiqueta = '', enTv = true } = req.body || {};
  let { competencia = null, partido = null } = req.body || {};
  const youtubeId = extraerYoutubeId(url);
  if (!youtubeId) return res.status(400).json({ error: 'El link no es de un video de YouTube' });
  if (partido && !esId(partido)) return res.status(400).json({ error: 'partido inválido' });
  if (competencia && !esId(competencia)) return res.status(400).json({ error: 'competencia inválida' });

  if (partido) {
    const p = await Partido.findById(partido).select('competencia').lean();
    if (!p) return res.status(404).json({ error: 'Partido no encontrado' });
    competencia = p.competencia ?? null;
  }
  if (!(await puedeEditar(req, { competencia, partido }))) return res.status(403).json({ error: 'No podés cargar videos acá' });

  const inicio = extraerInicio(url) || 0;
  let video;
  if (partido) {
    await agregarCamaras(partido, [{ youtubeId, etiqueta: etiqueta || 'Cámara', tramos: [] }], { creadoPor: req.user.uid });
    video = await Video.findOne({ partido, youtubeId });
    video.set({ titulo, enTv: Boolean(enTv) });
    if (inicio) video.inicio = inicio;
    await video.save();
    if (inicio) await proyectarEnPartido(partido);
    completarDuracionesEnSegundoPlano(partido);
  } else {
    const comp = competencia ? await Competencia.findById(competencia).select('organizacion').lean() : null;
    if (competencia && !comp) return res.status(404).json({ error: 'Competencia no encontrada' });
    video = await Video.create({
      youtubeId, inicio, titulo, etiqueta, enTv: Boolean(enTv),
      competencia, organizacion: comp?.organizacion ?? null, creadoPor: req.user.uid,
    });
    completarDuracionesDeVideos([video._id]);
  }
  res.status(201).json(await Video.findById(video._id).populate(POBLAR).lean());
}));

/**
 * @swagger
 * /api/videos/{id}:
 *   patch:
 *     summary: Edita un video del catálogo
 *     description: |
 *       Body (todo opcional): `{ titulo, etiqueta, enTv, partido, principal }`. `partido: null` lo
 *       deja suelto; otro id lo mueve a ese partido (tiene que ser de una competencia que puedas editar).
 *       `principal: true` lo hace cámara principal de su partido.
 *     tags: [Videos]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video no encontrado' });
  if (!(await puedeEditar(req, { competencia: video.competencia, partido: video.partido }))) {
    return res.status(403).json({ error: 'No podés editar este video' });
  }
  const b = req.body || {};
  if (typeof b.titulo === 'string') video.titulo = b.titulo;
  if (typeof b.etiqueta === 'string') video.etiqueta = b.etiqueta;
  if (typeof b.enTv === 'boolean') video.enTv = b.enTv;
  await video.save();
  if (typeof b.etiqueta === 'string' && video.partido) await proyectarEnPartido(video.partido);

  if (Object.prototype.hasOwnProperty.call(b, 'partido')) {
    const destino = b.partido || null;
    if (destino && !esId(destino)) return res.status(400).json({ error: 'partido inválido' });
    if (destino) {
      const p = await Partido.findById(destino).select('competencia').lean();
      if (!p) return res.status(404).json({ error: 'Partido no encontrado' });
      if (!(await puedeEditar(req, { competencia: p.competencia, partido: destino }))) {
        return res.status(403).json({ error: 'No podés mover el video a ese partido' });
      }
    }
    await moverVideo(video, destino);
    if (destino) completarDuracionesEnSegundoPlano(destino);
  }
  if (b.principal === true) await hacerPrincipal(video);
  res.json(await Video.findById(video._id).populate(POBLAR).lean());
}));

/**
 * @swagger
 * /api/videos/{id}:
 *   delete:
 *     summary: Saca un video del catálogo (y de su partido)
 *     tags: [Videos]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video no encontrado' });
  if (!(await puedeEditar(req, { competencia: video.competencia, partido: video.partido }))) {
    return res.status(403).json({ error: 'No podés borrar este video' });
  }
  await eliminarVideo(video);
  // Los canales que lo tenían elegido a mano lo pierden.
  await CanalTv.updateMany({ videos: video._id }, { $pull: { videos: video._id } });
  res.status(204).end();
}));

export default router;
