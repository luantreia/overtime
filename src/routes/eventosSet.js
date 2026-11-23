import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import EventoSet from '../models/Partido/EventoSet.js';
import SetPartido from '../models/Partido/SetPartido.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import Partido from '../models/Partido/Partido.js';
import { hasMatchPermission } from '../services/matchPermissionService.js';
import { puedeAccederPlanilla, planillaEstaCerrada } from '../services/planillaEquipoService.js';
import { resolverSet, alineacionDe, sincronizarEstadisticasPlanilla } from '../services/eventoSetService.js';

/**
 * Captura de sets "como en el panel de análisis": marcas de out/reingreso/cambio, alineación
 * y tiempo de cada set, para un set oficial (`setPartido`) o el de una planilla (`planillaSet`).
 * Es la API que consumen los componentes de captura de `overtime-kit`, igual en las 4 apps.
 *
 * Permisos: set oficial → `match.sets` sobre el partido; set de planilla → los mismos que
 * editar la planilla (y la planilla tiene que estar abierta).
 */
const router = express.Router();
const esId = (x) => typeof x === 'string' && mongoose.Types.ObjectId.isValid(x);

/** req.ref = el set dueño, a partir de setPartido|planillaSet en query o body. */
async function cargarSet(req, res, next) {
  const src = { ...req.query, ...req.body };
  const setPartido = esId(src.setPartido) ? src.setPartido : null;
  const planillaSet = esId(src.planillaSet) ? src.planillaSet : null;
  if (!setPartido === !planillaSet) {
    return res.status(400).json({ error: 'Indicá setPartido o planillaSet (uno solo)' });
  }
  const ref = await resolverSet({ setPartido, planillaSet });
  if (!ref) return res.status(404).json({ error: 'Set no encontrado' });
  req.ref = ref;
  return next();
}

async function puedeEditar(req, res, next) {
  const { ref } = req;
  if (ref.tipo === 'oficial') {
    const ok = await hasMatchPermission({
      partidoId: String(ref.partidoId), usuarioId: req.user.uid, rolGlobal: req.user.rol, permission: 'match.sets',
    });
    return ok ? next() : res.status(403).json({ error: 'No tenés permisos sobre los sets de este partido' });
  }
  const acceso = await puedeAccederPlanilla({ planilla: ref.planilla, usuario: req.user, accion: 'editar' });
  if (!acceso.permitido) return res.status(403).json({ error: 'No podés editar esta planilla' });
  if (planillaEstaCerrada(ref.planilla)) return res.status(409).json({ error: 'La planilla está cerrada a ediciones' });
  return next();
}

/** Lectura: lo oficial es público; una planilla, según quién la puede ver. */
async function puedeLeer(req, res, next) {
  if (req.ref.tipo === 'oficial') return next();
  return verificarToken(req, res, () => cargarRolDesdeBD(req, res, async () => {
    const acceso = await puedeAccederPlanilla({ planilla: req.ref.planilla, usuario: req.user, accion: 'leer' });
    return acceso.permitido ? next() : res.status(403).json({ error: 'No podés ver esta planilla' });
  }));
}

const filtroDe = (ref) => (ref.tipo === 'oficial' ? { setPartido: ref.set._id } : { planillaSet: ref.set._id });
const modeloDe = (ref) => (ref.tipo === 'oficial' ? SetPartido : PlanillaSet);

async function respuestaCompleta(ref) {
  const [eventos, alineacion] = await Promise.all([
    EventoSet.find(filtroDe(ref)).sort({ t: 1 }).lean(),
    alineacionDe(ref),
  ]);
  return {
    set: { _id: ref.set._id, numeroSet: ref.set.numeroSet, tiempo: ref.set.tiempo ?? null },
    alineacion: alineacion.map((a) => ({ jugador: a.id, equipo: a.lado })),
    alineacionCargada: (ref.set.alineacion?.length ?? 0) > 0,
    eventos,
  };
}

const conErrores = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.name === 'ValidationError' || /exactamente uno|necesita/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[eventos-set]', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * @swagger
 * /api/eventos-set:
 *   get:
 *     summary: Marcas, alineación y tiempo de un set (oficial o de planilla)
 *     tags: [EventosSet]
 *     parameters:
 *       - { in: query, name: setPartido, schema: { type: string } }
 *       - { in: query, name: planillaSet, schema: { type: string } }
 */
router.get('/', cargarSet, puedeLeer, conErrores(async (req, res) => {
  res.json(await respuestaCompleta(req.ref));
}));

/**
 * @swagger
 * /api/eventos-set:
 *   post:
 *     summary: Agrega una marca (out, reingreso o cambio) a un set
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', verificarToken, cargarRolDesdeBD, cargarSet, puedeEditar, conErrores(async (req, res) => {
  const { t, tipo, jugador, equipo, motivo, por, entra, origen } = req.body;
  await EventoSet.create({
    ...filtroDe(req.ref),
    partido: req.ref.partidoId,
    t, tipo, jugador, equipo,
    motivo: motivo || null,
    por: por || null,
    entra: entra || null,
    origen: origen || 'manual',
    creadoPor: req.user.uid,
  });
  const sync = await sincronizarEstadisticasPlanilla(req.ref);
  res.status(201).json({ ...(await respuestaCompleta(req.ref)), sync });
}));

/**
 * @swagger
 * /api/eventos-set/{id}:
 *   delete:
 *     summary: Borra una marca
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', verificarToken, cargarRolDesdeBD, async (req, res, next) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const ev = await EventoSet.findById(req.params.id).lean();
  if (!ev) return res.status(404).json({ error: 'Marca no encontrada' });
  req.body = { setPartido: ev.setPartido ? String(ev.setPartido) : undefined, planillaSet: ev.planillaSet ? String(ev.planillaSet) : undefined };
  req.evento = ev;
  return next();
}, cargarSet, puedeEditar, conErrores(async (req, res) => {
  await EventoSet.deleteOne({ _id: req.evento._id });
  const sync = await sincronizarEstadisticasPlanilla(req.ref);
  res.json({ ...(await respuestaCompleta(req.ref)), sync });
}));

/**
 * @swagger
 * /api/eventos-set/alineacion:
 *   put:
 *     summary: Define quiénes arrancan el set en cancha
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/alineacion', verificarToken, cargarRolDesdeBD, cargarSet, puedeEditar, conErrores(async (req, res) => {
  const alineacion = Array.isArray(req.body.alineacion) ? req.body.alineacion : null;
  if (!alineacion || !alineacion.every((a) => esId(String(a.jugador)) && esId(String(a.equipo)))) {
    return res.status(400).json({ error: 'alineacion debe ser [{ jugador, equipo }]' });
  }
  await modeloDe(req.ref).updateOne({ _id: req.ref.set._id }, { $set: { alineacion } }, { runValidators: true });
  req.ref.set.alineacion = alineacion;
  const sync = await sincronizarEstadisticasPlanilla(req.ref);
  res.json({ ...(await respuestaCompleta(req.ref)), sync });
}));

/**
 * @swagger
 * /api/eventos-set/tiempo:
 *   put:
 *     summary: Dónde está el set en el video (segundos de partido), o null para borrarlo
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/tiempo', verificarToken, cargarRolDesdeBD, cargarSet, puedeEditar, conErrores(async (req, res) => {
  const tiempo = req.body.tiempo ?? null;
  if (tiempo && !(Number.isFinite(tiempo.desde) && Number.isFinite(tiempo.hasta) && tiempo.hasta > tiempo.desde)) {
    return res.status(400).json({ error: 'tiempo debe ser { desde, hasta } con hasta > desde' });
  }
  const valor = tiempo
    ? { desde: tiempo.desde, hasta: tiempo.hasta, origen: tiempo.origen || 'manual', confirmado: tiempo.confirmado ?? true }
    : null;
  await modeloDe(req.ref).updateOne({ _id: req.ref.set._id }, { $set: { tiempo: valor } }, { runValidators: true });
  req.ref.set.tiempo = valor;
  const sync = await sincronizarEstadisticasPlanilla(req.ref);
  res.json({ ...(await respuestaCompleta(req.ref)), sync });
}));

/**
 * @swagger
 * /api/eventos-set/videos/{partidoId}:
 *   put:
 *     summary: Reemplaza los videos (cámaras) del partido
 *     description: Requiere `match.resultado`, el mismo permiso que editar `videoUrl`.
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/videos/:partidoId', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  const { partidoId } = req.params;
  if (!esId(partidoId)) return res.status(400).json({ error: 'partidoId inválido' });
  const ok = await hasMatchPermission({ partidoId, usuarioId: req.user.uid, rolGlobal: req.user.rol, permission: 'match.resultado' });
  if (!ok) return res.status(403).json({ error: 'No podés editar los videos de este partido' });
  const videos = Array.isArray(req.body.videos) ? req.body.videos : null;
  if (!videos) return res.status(400).json({ error: 'videos debe ser un array' });

  const set = { videos };
  const actual = await Partido.findById(partidoId).select('videoUrl').lean();
  if (!actual) return res.status(404).json({ error: 'Partido no encontrado' });
  // Compatibilidad: la cámara principal también va a `videoUrl` si estaba vacío.
  if (!actual.videoUrl && videos[0]?.youtubeId) set.videoUrl = `https://www.youtube.com/watch?v=${videos[0].youtubeId}`;
  await Partido.updateOne({ _id: partidoId }, { $set: set }, { runValidators: true });
  const p = await Partido.findById(partidoId).select('videos videoUrl').lean();
  res.json(p);
}));

/**
 * @swagger
 * /api/eventos-set/videos-planilla/{planillaId}:
 *   put:
 *     summary: Reemplaza los videos (cámaras) propios de una planilla
 *     description: Mismos permisos que editar la planilla, que tiene que estar abierta. No toca el partido.
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/videos-planilla/:planillaId', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  const { planillaId } = req.params;
  if (!esId(planillaId)) return res.status(400).json({ error: 'planillaId inválido' });
  const planilla = await PlanillaEquipo.findById(planillaId).lean();
  if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });
  const acceso = await puedeAccederPlanilla({ planilla, usuario: req.user, accion: 'editar' });
  if (!acceso.permitido) return res.status(403).json({ error: 'No podés editar esta planilla' });
  if (planillaEstaCerrada(planilla)) return res.status(409).json({ error: 'La planilla está cerrada a ediciones' });
  const videos = Array.isArray(req.body.videos) ? req.body.videos : null;
  if (!videos) return res.status(400).json({ error: 'videos debe ser un array' });
  await PlanillaEquipo.updateOne({ _id: planillaId }, { $set: { videos } }, { runValidators: true });
  const p = await PlanillaEquipo.findById(planillaId).select('videos').lean();
  res.json({ videos: p.videos, videoUrl: '' });
}));

export default router;
