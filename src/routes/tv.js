import express from 'express';
import Partido from '../models/Partido/Partido.js';
import { obtenerDuraciones, extraerYoutubeId, extraerInicio } from '../services/duracionYoutubeService.js';
import { completarDuraciones } from '../services/duracionesPartidoService.js';

const router = express.Router();

/**
 * @swagger
 * /api/tv/videos:
 *   get:
 *     summary: Catálogo de Overtime TV
 *     description: |
 *       Partidos con video reproducible y la duración efectiva de cada uno (desde el `t=` del
 *       link hasta el final). Con esto el cliente arma la grilla según el reloj: todos ven lo
 *       mismo al mismo tiempo. `ahora` es la hora del servidor, para corregir relojes de
 *       clientes desfasados. Los videos privados/borrados no se incluyen.
 *     tags: [TV]
 *     responses:
 *       200:
 *         description: "{ ahora: number, items: [...] }"
 */
router.get('/videos', async (_req, res) => {
  try {
    const partidos = await Partido.find({ videoUrl: { $nin: ['', null] } })
      .select('videoUrl videos fecha marcadorLocal marcadorVisitante equipoLocal equipoVisitante competencia fase')
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .populate('competencia', 'nombre')
      .populate('fase', 'nombre')
      .lean();

    const conId = partidos
      .map((p) => ({ p, videoId: extraerYoutubeId(p.videoUrl), inicio: extraerInicio(p.videoUrl) }))
      .filter((x) => x.videoId);

    // Primero la duración guardada en el partido (scripts/guardarDuracionesVideo.js); a YouTube
    // sólo se le pregunta por lo que falte: desde Render, YouTube suele bloquear esa consulta.
    const duraciones = new Map();
    for (const { p } of conId) {
      for (const v of p.videos || []) if (v.youtubeId && v.duracion > 0) duraciones.set(v.youtubeId, v.duracion);
    }
    const faltan = [...new Set(conId.map((x) => x.videoId).filter((id) => !duraciones.has(id)))];
    if (faltan.length) {
      const nuevas = await obtenerDuraciones(faltan);
      for (const [id, d] of nuevas) duraciones.set(id, d);
      // Lo que YouTube sí devolvió queda guardado en los partidos: la próxima vez no se pregunta.
      const conDuracion = new Set([...nuevas].filter(([, d]) => d > 0).map(([id]) => id));
      if (conDuracion.size) {
        const ids = conId.filter((x) => conDuracion.has(x.videoId)).map((x) => x.p._id);
        completarDuraciones(ids).catch((e) => console.error('[tv] no se pudieron guardar duraciones', e.message));
      }
    }

    const items = conId
      .map(({ p, videoId, inicio }) => {
        const total = duraciones.get(videoId);
        if (!total || total - inicio < 30) return null;
        return {
          _id: p._id,
          videoId,
          inicio,
          duracion: total - inicio,
          fecha: p.fecha,
          marcadorLocal: p.marcadorLocal,
          marcadorVisitante: p.marcadorVisitante,
          equipoLocal: p.equipoLocal,
          equipoVisitante: p.equipoVisitante,
          competencia: p.competencia,
          fase: p.fase,
        };
      })
      .filter(Boolean)
      // Orden estable: el cliente mezcla con una semilla, así que la entrada tiene que ser la misma para todos.
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ ahora: Date.now(), items });
  } catch (err) {
    console.error('[tv] error armando catálogo:', err);
    res.status(500).json({ message: 'Error al armar la programación' });
  }
});

export default router;
