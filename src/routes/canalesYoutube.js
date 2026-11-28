import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import CanalYoutube from '../models/Video/CanalYoutube.js';
import Video from '../models/Video/Video.js';
import Competencia from '../models/Competencia/Competencia.js';
import { resolverCanalYoutube } from '../services/vivoYoutubeService.js';
import { listarVideosCanal } from '../services/videosCanalYoutubeService.js';
import { completarDuracionesDeVideos } from '../services/duracionesPartidoService.js';

/**
 * Canales de YouTube guardados en el catálogo (sólo Super Admin): de acá se importan videos
 * eligiéndolos de una lista, y se eligen como fuente de vivos de los canales de la TV.
 */
const router = express.Router();
const esId = (v) => mongoose.Types.ObjectId.isValid(v);

router.use(verificarToken, cargarRolDesdeBD, (req, res, next) =>
  String(req.user?.rol || '').toLowerCase() === 'admin' ? next() : res.status(403).json({ error: 'Sólo Super Admin' }));

const conErrores = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    console.error('[youtube-canales]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * @swagger
 * /api/youtube-canales:
 *   get:
 *     summary: Canales de YouTube guardados. Sólo Super Admin.
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: "Guarda un canal de YouTube: { url } (link, @handle o id UC…). Si ya estaba, lo devuelve."
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', conErrores(async (_req, res) => {
  res.json(await CanalYoutube.find().sort({ nombre: 1 }).lean());
}));

router.post('/', conErrores(async (req, res) => {
  const { channelId, nombre } = await resolverCanalYoutube(req.body?.url);
  const canal = await CanalYoutube.findOneAndUpdate(
    { channelId },
    { $set: { nombre }, $setOnInsert: { creadoPor: req.user.uid } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  res.status(201).json(canal);
}));

/**
 * @swagger
 * /api/youtube-canales/{id}:
 *   delete:
 *     summary: Saca el canal de la lista (los videos importados quedan en el catálogo).
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  await CanalYoutube.deleteOne({ _id: req.params.id });
  res.status(204).end();
}));

/**
 * @swagger
 * /api/youtube-canales/{id}/videos:
 *   get:
 *     summary: Videos del canal de YouTube, marcando los que ya están en el catálogo
 *     description: |
 *       Con YOUTUBE_API_KEY pagina todo el historial (`pageToken`); sin key, sólo los últimos ~15
 *       (`completo: false`).
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/videos', conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const canal = await CanalYoutube.findById(req.params.id).lean();
  if (!canal) return res.status(404).json({ error: 'Canal no encontrado' });
  const r = await listarVideosCanal(canal.channelId, req.query.pageToken || null);
  const ya = new Set(await Video.distinct('youtubeId', { youtubeId: { $in: r.items.map((v) => v.youtubeId) } }));
  res.json({ ...r, items: r.items.map((v) => ({ ...v, enCatalogo: ya.has(v.youtubeId) })) });
}));

/**
 * @swagger
 * /api/youtube-canales/{id}/importar:
 *   post:
 *     summary: Importa videos elegidos como videos sueltos del catálogo
 *     description: |
 *       Body: `{ videos: [{ youtubeId, titulo }], competencia? }`. Los que ya están en el catálogo
 *       (suelto o como cámara de un partido) se saltean. → `{ creados, salteados }`
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/importar', conErrores(async (req, res) => {
  const lista = Array.isArray(req.body?.videos) ? req.body.videos : null;
  if (!lista?.length) return res.status(400).json({ error: 'Elegí al menos un video' });
  if (lista.length > 200) return res.status(400).json({ error: 'Máximo 200 videos por vez' });
  if (!lista.every((v) => /^[\w-]{11}$/.test(v?.youtubeId || ''))) return res.status(400).json({ error: 'youtubeId inválido' });
  const { competencia = null } = req.body;
  let organizacion = null;
  if (competencia) {
    if (!esId(competencia)) return res.status(400).json({ error: 'competencia inválida' });
    const c = await Competencia.findById(competencia).select('organizacion').lean();
    if (!c) return res.status(404).json({ error: 'Competencia no encontrada' });
    organizacion = c.organizacion ?? null;
  }
  const ya = new Set(await Video.distinct('youtubeId', { youtubeId: { $in: lista.map((v) => v.youtubeId) } }));
  const vistos = new Set();
  const nuevos = lista.filter((v) => !ya.has(v.youtubeId) && !vistos.has(v.youtubeId) && vistos.add(v.youtubeId));
  const creados = nuevos.length
    ? await Video.insertMany(nuevos.map((v) => ({
      youtubeId: v.youtubeId, titulo: String(v.titulo || ''), competencia, organizacion, creadoPor: req.user.uid,
    })))
    : [];
  if (creados.length) completarDuracionesDeVideos(creados.map((v) => v._id));
  res.status(201).json({ creados: creados.length, salteados: lista.length - creados.length });
}));

export default router;
