import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import Video from '../models/Video/Video.js';
import CanalTv from '../models/Video/CanalTv.js';
import { obtenerDuraciones } from '../services/duracionYoutubeService.js';
import { proyectarEnPartido } from '../services/videoCatalogoService.js';
import { vivosDeCanales, resolverCanalYoutube } from '../services/vivoYoutubeService.js';

const router = express.Router();
const esId = (v) => mongoose.Types.ObjectId.isValid(v);

/** Qué videos programa la TV: los sueltos y la cámara principal de cada partido, si están en TV. */
const FILTRO_TV = { enTv: true, $or: [{ partido: null }, { orden: 0 }] };

/**
 * @swagger
 * /api/tv/videos:
 *   get:
 *     summary: Catálogo y canales de Overtime TV
 *     description: |
 *       Sale del catálogo de videos (models/Video/Video.js): los videos sueltos y la cámara
 *       principal de cada partido, con `enTv`, y la duración efectiva de cada uno (desde el `t=`
 *       hasta el final). `_id` es el del partido (para links ya compartidos) o el del video si es
 *       suelto. `canales` son los canales activos (orden de Admin) con los `_id` que programa cada
 *       uno; si está vacío, la TV arma un canal por competencia. `ahora` es la hora del servidor.
 *     tags: [TV]
 *     responses:
 *       200:
 *         description: "{ ahora: number, items: [...], canales: [...] }"
 */
router.get('/videos', async (_req, res) => {
  try {
    const videos = await Video.find(FILTRO_TV)
      .select('youtubeId inicio duracion titulo partido competencia')
      .populate({
        path: 'partido',
        select: 'fecha marcadorLocal marcadorVisitante equipoLocal equipoVisitante fase',
        populate: [{ path: 'equipoLocal', select: 'nombre escudo' }, { path: 'equipoVisitante', select: 'nombre escudo' }, { path: 'fase', select: 'nombre' }],
      })
      .populate('competencia', 'nombre')
      .lean();

    // A YouTube sólo se le pregunta por lo que falte: desde Render suele bloquear esa consulta.
    const faltan = [...new Set(videos.filter((v) => !(v.duracion > 0)).map((v) => v.youtubeId))];
    if (faltan.length) {
      const nuevas = await obtenerDuraciones(faltan);
      const conDuracion = [...nuevas].filter(([, d]) => d > 0);
      for (const v of videos) if (nuevas.get(v.youtubeId) > 0) v.duracion = nuevas.get(v.youtubeId);
      // Lo que YouTube sí devolvió queda guardado: la próxima vez no se pregunta.
      if (conDuracion.length) {
        (async () => {
          for (const [youtubeId, duracion] of conDuracion) await Video.updateMany({ youtubeId, duracion: null }, { $set: { duracion } });
          const partidos = new Set(videos.filter((v) => v.partido && nuevas.get(v.youtubeId) > 0).map((v) => String(v.partido._id)));
          for (const id of partidos) await proyectarEnPartido(id);
        })().catch((e) => console.error('[tv] no se pudieron guardar duraciones', e.message));
      }
    }

    const idDeVideo = new Map(); // _id de Video → _id del item
    const items = videos
      .map((v) => {
        const total = v.duracion;
        const inicio = v.inicio || 0;
        if (!total || total - inicio < 30) return null;
        const p = v.partido;
        const _id = p ? String(p._id) : String(v._id);
        idDeVideo.set(String(v._id), _id);
        return {
          _id,
          partidoId: p ? String(p._id) : null,
          videoId: v.youtubeId,
          titulo: v.titulo || '',
          inicio,
          duracion: total - inicio,
          fecha: p?.fecha,
          marcadorLocal: p?.marcadorLocal,
          marcadorVisitante: p?.marcadorVisitante,
          equipoLocal: p?.equipoLocal,
          equipoVisitante: p?.equipoVisitante,
          competencia: v.competencia,
          fase: p?.fase,
        };
      })
      .filter(Boolean)
      // Orden estable: el cliente mezcla con una semilla, así que la entrada tiene que ser la misma para todos.
      .sort((a, b) => a._id.localeCompare(b._id));

    const porCompetencia = new Map();
    for (const v of videos) {
      const it = idDeVideo.get(String(v._id));
      if (!it || !v.competencia) continue;
      const k = String(v.competencia._id);
      if (!porCompetencia.has(k)) porCompetencia.set(k, []);
      porCompetencia.get(k).push(it);
    }
    const canales = (await CanalTv.find({ activo: true }).sort({ orden: 1, nombre: 1 }).lean())
      .map((c) => {
        const ids = new Set([
          ...(c.videos || []).map((id) => idDeVideo.get(String(id))).filter(Boolean),
          ...(c.competencias || []).flatMap((id) => porCompetencia.get(String(id)) || []),
        ]);
        const conVivo = (c.fuentesYoutube || []).length > 0;
        return { _id: String(c._id), slug: c.slug, nombre: c.nombre, descripcion: c.descripcion, ids: [...ids].sort(), conVivo };
      })
      // Un canal sin grabados igual se lista si puede tener vivos.
      .filter((c) => c.ids.length > 0 || c.conVivo);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ ahora: Date.now(), items, canales });
  } catch (err) {
    console.error('[tv] error armando catálogo:', err);
    res.status(500).json({ message: 'Error al armar la programación' });
  }
});

/**
 * @swagger
 * /api/tv/vivo:
 *   get:
 *     summary: Transmisiones en vivo de YouTube que están al aire ahora
 *     description: |
 *       Por cada canal activo con `fuentesYoutube`, las transmisiones en curso de esos canales de
 *       YouTube (puede haber varias). `vivos` junta todas sin repetir, para "Todos los canales".
 *       YouTube se consulta como mucho cada 3 minutos por canal, no por visita.
 *     tags: [TV]
 *     responses:
 *       200:
 *         description: "{ ahora, canales: [{ slug, nombre, vivos }], vivos }"
 */
router.get('/vivo', async (_req, res) => {
  try {
    const canales = await CanalTv.find({ activo: true, 'fuentesYoutube.0': { $exists: true } }).sort({ orden: 1, nombre: 1 }).lean();
    const porYoutube = await vivosDeCanales(canales.flatMap((c) => c.fuentesYoutube.map((f) => f.channelId)));
    const salida = canales.map((c) => ({
      slug: c.slug,
      nombre: c.nombre,
      vivos: c.fuentesYoutube.flatMap((f) => porYoutube.get(f.channelId) || []),
    }));
    const vistos = new Set();
    const vivos = salida.flatMap((c) => c.vivos).filter((v) => !vistos.has(v.videoId) && vistos.add(v.videoId));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ahora: Date.now(), canales: salida, vivos });
  } catch (err) {
    console.error('[tv/vivo]', err);
    res.status(500).json({ message: 'Error consultando transmisiones en vivo' });
  }
});

/* ── Canales: sólo Super Admin ─────────────────────────────────────────────── */

const soloAdmin = (req, res, next) =>
  String(req.user?.rol || '').toLowerCase() === 'admin' ? next() : res.status(403).json({ error: 'Sólo Super Admin' });

const slugDe = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Campos editables de un canal, validados. → { datos } | { error } */
function leerCanal(body = {}, parcial = false) {
  const datos = {};
  if (body.nombre !== undefined || !parcial) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) return { error: 'El canal necesita un nombre' };
    datos.nombre = nombre;
  }
  if (body.slug !== undefined || !parcial) {
    const slug = slugDe(body.slug || body.nombre);
    if (!slug) return { error: 'Slug inválido' };
    datos.slug = slug;
  }
  if (body.descripcion !== undefined) datos.descripcion = String(body.descripcion || '');
  if (body.activo !== undefined) datos.activo = Boolean(body.activo);
  if (body.orden !== undefined) datos.orden = Number(body.orden) || 0;
  if (body.fuentesYoutube !== undefined) {
    const ok = Array.isArray(body.fuentesYoutube) && body.fuentesYoutube.every((f) => /^UC[w-]{22}$/.test(f?.channelId || ''));
    if (!ok) return { error: 'fuentesYoutube debe ser una lista de { channelId, nombre }' };
    const vistos = new Set();
    datos.fuentesYoutube = body.fuentesYoutube
      .filter((f) => !vistos.has(f.channelId) && vistos.add(f.channelId))
      .map((f) => ({ channelId: f.channelId, nombre: String(f.nombre || '') }));
  }
  for (const campo of ['videos', 'competencias']) {
    if (body[campo] === undefined) continue;
    if (!Array.isArray(body[campo]) || !body[campo].every(esId)) return { error: `${campo} debe ser una lista de ids` };
    datos[campo] = [...new Set(body[campo].map(String))];
  }
  return { datos };
}

const POBLAR_CANAL = [
  { path: 'competencias', select: 'nombre' },
  { path: 'videos', select: 'youtubeId titulo etiqueta duracion enTv partido competencia', populate: [{ path: 'competencia', select: 'nombre' }, { path: 'partido', select: 'fecha equipoLocal equipoVisitante', populate: [{ path: 'equipoLocal', select: 'nombre' }, { path: 'equipoVisitante', select: 'nombre' }] }] },
];

const conErrores = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Ya hay un canal con ese slug' });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    console.error('[tv/canales]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * @swagger
 * /api/tv/canales:
 *   get:
 *     summary: Lista todos los canales (incluidos los inactivos). Sólo Super Admin.
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: "Crea un canal: { nombre, slug?, descripcion?, activo?, orden?, videos?, competencias? }"
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/canales', verificarToken, cargarRolDesdeBD, soloAdmin, conErrores(async (_req, res) => {
  res.json(await CanalTv.find().sort({ orden: 1, nombre: 1 }).populate(POBLAR_CANAL).lean());
}));

router.post('/canales', verificarToken, cargarRolDesdeBD, soloAdmin, conErrores(async (req, res) => {
  const { datos, error } = leerCanal(req.body);
  if (error) return res.status(400).json({ error });
  if (datos.orden === undefined) {
    const ultimo = await CanalTv.findOne().sort({ orden: -1 }).select('orden').lean();
    datos.orden = (ultimo?.orden ?? -1) + 1;
  }
  const canal = await CanalTv.create(datos);
  res.status(201).json(await CanalTv.findById(canal._id).populate(POBLAR_CANAL).lean());
}));

/**
 * @swagger
 * /api/tv/canales/orden:
 *   put:
 *     summary: "Reordena los canales: { ids: [canalId, ...] } en el orden nuevo. Sólo Super Admin."
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
/**
 * @swagger
 * /api/tv/canales/resolver-youtube:
 *   post:
 *     summary: "Link de un canal de YouTube (@handle, /channel/UC…) → { channelId, nombre }. Sólo Super Admin."
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/canales/resolver-youtube', verificarToken, cargarRolDesdeBD, soloAdmin, async (req, res) => {
  try {
    res.json(await resolverCanalYoutube(req.body?.url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.status ? err.message : 'No se pudo consultar YouTube' });
  }
});

router.put('/canales/orden', verificarToken, cargarRolDesdeBD, soloAdmin, conErrores(async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(esId)) return res.status(400).json({ error: 'ids debe ser una lista de ids' });
  await CanalTv.bulkWrite(ids.map((id, orden) => ({ updateOne: { filter: { _id: id }, update: { $set: { orden } } } })));
  res.json(await CanalTv.find().sort({ orden: 1, nombre: 1 }).populate(POBLAR_CANAL).lean());
}));

/**
 * @swagger
 * /api/tv/canales/{id}:
 *   put:
 *     summary: Edita un canal (campos parciales). Sólo Super Admin.
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Borra un canal (los videos quedan en el catálogo). Sólo Super Admin.
 *     tags: [TV]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/canales/:id', verificarToken, cargarRolDesdeBD, soloAdmin, conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const { datos, error } = leerCanal(req.body, true);
  if (error) return res.status(400).json({ error });
  const canal = await CanalTv.findByIdAndUpdate(req.params.id, { $set: datos }, { new: true, runValidators: true }).populate(POBLAR_CANAL).lean();
  if (!canal) return res.status(404).json({ error: 'Canal no encontrado' });
  res.json(canal);
}));

router.delete('/canales/:id', verificarToken, cargarRolDesdeBD, soloAdmin, conErrores(async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const r = await CanalTv.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Canal no encontrado' });
  res.status(204).end();
}));

export default router;
