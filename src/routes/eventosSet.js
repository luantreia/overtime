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
import TimerManager from '../services/TimerManager.js';
import { ganadorDesdeMarcas } from '../utils/supervivencia.js';
import { relojDelPartido, segundoDesdeHora, alinearRelojEnVivo, ubicarDesdeConsola } from '../services/relojEnVivoService.js';
import { completarDuracionesEnSegundoPlano } from '../services/duracionesPartidoService.js';
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
  const [eventos, alineacion, partido] = await Promise.all([
    EventoSet.find(filtroDe(ref)).sort({ t: 1 }).lean(),
    alineacionDe(ref),
    Partido.findById(ref.partidoId).select('equipoLocal equipoVisitante relojEnVivo relojJuego').lean(),
  ]);
  const ganadorSugerido = ganadorDesdeMarcas(alineacion, eventos, {
    inicio: ref.set.tiempo?.desde ?? 0,
    fin: ref.set.tiempo?.hasta ?? null,
    ladoLocal: partido?.equipoLocal && String(partido.equipoLocal),
    ladoVisitante: partido?.equipoVisitante && String(partido.equipoVisitante),
  });
  return {
    set: {
      _id: ref.set._id,
      numeroSet: ref.set.numeroSet,
      tiempo: ref.set.tiempo ?? null,
      ganadorSet: ref.set.ganadorSet ?? 'pendiente',
    },
    // `equipo`: el id del ganador sugerido, para que la UI lo nombre sin saber quién es local.
    ganadorSugerido: {
      ...ganadorSugerido,
      equipo: ganadorSugerido.ganador ? String(partido?.[ganadorSugerido.ganador === 'local' ? 'equipoLocal' : 'equipoVisitante']) : null,
    },
    alineacion: alineacion.map((a) => ({ jugador: a.id, equipo: a.lado })),
    alineacionCargada: (ref.set.alineacion?.length ?? 0) > 0,
    // Captura en vivo: con esto el cliente calcula el segundo "ahora" igual que el servidor.
    relojEnVivo: partido?.relojEnVivo ?? null,
    // Reloj de juego registrado en Overtime-Partido: con relojEnVivo se sabe el minuto de juego
    // de cualquier segundo del video (utils/relojJuego.js).
    relojJuego: partido?.relojJuego ?? [],
    ahoraServidor: Date.now(),
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
  const { tipo, jugador, equipo, motivo, por, entra, origen } = req.body;
  let { t } = req.body;
  // En vivo, el segundo sale de la hora real del servidor, no del reloj de juego del cliente.
  const hora = origen === 'en_vivo' && req.ref.tipo === 'oficial' ? new Date() : null;
  if (hora) t = Math.max(0, segundoDesdeHora(await relojDelPartido(req.ref.partidoId, hora), hora));
  await EventoSet.create({
    ...filtroDe(req.ref),
    partido: req.ref.partidoId,
    t, tipo, jugador, equipo, hora,
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
  // En vivo: el extremo que cambió es "ahora" (hora real del servidor), y se guarda su hora para
  // poder recalcularlo al alinear con el video. El otro extremo conserva lo que tenía.
  // marcarAhora: false = guardar estos segundos tal cual (p. ej. confirmar un set que ubicó la consola).
  if (valor && valor.origen === 'en_vivo' && req.ref.tipo === 'oficial' && req.body.marcarAhora !== false) {
    const hora = new Date();
    const ahora = Math.max(0, segundoDesdeHora(await relojDelPartido(req.ref.partidoId, hora), hora));
    const previo = req.ref.set.tiempo;
    if (previo?.horaDesde) valor.horaDesde = previo.horaDesde;
    if (previo?.horaHasta) valor.horaHasta = previo.horaHasta;
    if (!previo || previo.desde !== tiempo.desde) {
      valor.desde = ahora;
      valor.horaDesde = hora;
    }
    if (previo && previo.hasta !== tiempo.hasta) {
      valor.hasta = ahora;
      valor.horaHasta = hora;
    }
    if (valor.hasta <= valor.desde) valor.hasta = valor.desde + 1;
  }
  await modeloDe(req.ref).updateOne({ _id: req.ref.set._id }, { $set: { tiempo: valor } }, { runValidators: true });
  req.ref.set.tiempo = valor;
  const sync = await sincronizarEstadisticasPlanilla(req.ref);
  res.json({ ...(await respuestaCompleta(req.ref)), sync });
}));

/**
 * @swagger
 * /api/eventos-set/reloj-en-vivo:
 *   put:
 *     summary: Alinea las marcas en vivo del partido con el video
 *     description: >
 *       "Esta marca en vivo está en este segundo del video". Con un solo punto alcanza: la hora
 *       real avanza igual que el video. Recalcula todas las marcas en vivo del partido y el
 *       tiempo en vivo de sus sets. Body { eventoId, segundo }. Requiere match.sets.
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/reloj-en-vivo', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  // Dos formas de decir el punto de alineación: una marca en vivo (eventoId), o un momento del
  // reloj de juego (setPartido + hora, p. ej. "el inicio del 1T es acá").
  const { eventoId, setPartido, hora: horaBody, segundo } = req.body;
  if (!Number.isFinite(segundo) || segundo < 0) return res.status(400).json({ error: 'segundo debe ser >= 0' });
  let partidoId;
  let hora;
  let setId;
  if (esId(eventoId)) {
    const ev = await EventoSet.findById(eventoId).lean();
    if (!ev?.hora || !ev.setPartido) return res.status(400).json({ error: 'Esa marca no es una marca en vivo de un set oficial' });
    partidoId = ev.partido;
    hora = ev.hora;
    setId = ev.setPartido;
  } else if (esId(setPartido) && horaBody && !Number.isNaN(new Date(horaBody).getTime())) {
    const set = await SetPartido.findById(setPartido).select('partido').lean();
    if (!set) return res.status(404).json({ error: 'Set no encontrado' });
    const p = await Partido.findById(set.partido).select('relojJuego').lean();
    const existe = (p?.relojJuego || []).some((x) => new Date(x.hora).getTime() === new Date(horaBody).getTime());
    if (!existe) return res.status(400).json({ error: 'Ese momento no está en el reloj de juego del partido' });
    partidoId = set.partido;
    hora = new Date(horaBody);
    setId = setPartido;
  } else {
    return res.status(400).json({ error: 'Indicá eventoId, o setPartido y hora' });
  }
  const ok = await hasMatchPermission({
    partidoId: String(partidoId), usuarioId: req.user.uid, rolGlobal: req.user.rol, permission: 'match.sets',
  });
  if (!ok) return res.status(403).json({ error: 'No tenés permisos sobre los sets de este partido' });
  const resultado = await alinearRelojEnVivo(partidoId, { hora, segundoVideo: segundo });
  const ref = await resolverSet({ setPartido: String(setId) });
  res.json({ ...(await respuestaCompleta(ref)), alineado: { marcas: resultado.marcas, sets: resultado.sets } });
}));

/**
 * @swagger
 * /api/eventos-set/ventana:
 *   put:
 *     summary: Inicio y fin del partido en el tiempo del partido (marcado en diferido)
 *     description: >
 *       Body { partidoId | planillaId, ventana: { desde, hasta } | null }. En un partido requiere
 *       match.resultado; en una planilla, poder editarla (abierta). Queda con origen 'manual' y
 *       confirmado: lo marcó una persona. Reemplaza a una ventana en vivo sin confirmar.
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/ventana', verificarToken, cargarRolDesdeBD, conErrores(async (req, res) => {
  const { partidoId, planillaId } = req.body;
  const v = req.body.ventana ?? null;
  const num = (x) => x === null || (Number.isFinite(x) && x >= 0);
  if (v && (!num(v.desde) || !num(v.hasta) || (v.desde != null && v.hasta != null && v.hasta <= v.desde))) {
    return res.status(400).json({ error: 'ventana debe ser { desde, hasta } en segundos, con hasta > desde' });
  }
  const valor = v ? { desde: v.desde ?? null, hasta: v.hasta ?? null, origen: 'manual', confirmado: true } : null;
  if (esId(planillaId)) {
    const planilla = await PlanillaEquipo.findById(planillaId).lean();
    if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });
    const acceso = await puedeAccederPlanilla({ planilla, usuario: req.user, accion: 'editar' });
    if (!acceso.permitido) return res.status(403).json({ error: 'No podés editar esta planilla' });
    if (planillaEstaCerrada(planilla)) return res.status(409).json({ error: 'La planilla está cerrada a ediciones' });
    await PlanillaEquipo.updateOne({ _id: planillaId }, { $set: { ventana: valor } }, { runValidators: true });
    return res.json({ ventana: valor });
  }
  if (!esId(partidoId)) return res.status(400).json({ error: 'Indicá partidoId o planillaId' });
  const ok = await hasMatchPermission({ partidoId, usuarioId: req.user.uid, rolGlobal: req.user.rol, permission: 'match.resultado' });
  if (!ok) return res.status(403).json({ error: 'No podés editar este partido' });
  await Partido.updateOne({ _id: partidoId }, { $set: { ventana: valor } }, { runValidators: true });
  return res.json({ ventana: valor });
}));

/**
 * @swagger
 * /api/eventos-set/consola/{partidoId}:
 *   get:
 *     summary: Lo que la consola de Overtime-Partido dejó para este partido, en el tiempo del partido
 *     description: Sets oficiales (con su tiempo y ganador), ventana y si el reloj en vivo ya se alineó con el video. Público, como lo oficial.
 *     tags: [EventosSet]
 */
router.get('/consola/:partidoId', conErrores(async (req, res) => {
  const { partidoId } = req.params;
  if (!esId(partidoId)) return res.status(400).json({ error: 'partidoId inválido' });
  await ubicarDesdeConsola(partidoId);
  const [p, sets] = await Promise.all([
    Partido.findById(partidoId).select('relojEnVivo ventana relojJuego').lean(),
    SetPartido.find({ partido: partidoId }).select('numeroSet ganadorSet tiempo iniciadoEn').sort({ numeroSet: 1 }).lean(),
  ]);
  if (!p) return res.status(404).json({ error: 'Partido no encontrado' });
  res.json({
    relojEnVivo: p.relojEnVivo ?? null,
    ventana: p.ventana ?? null,
    relojJuego: p.relojJuego ?? [],
    sets: sets.map((s) => ({ _id: s._id, numeroSet: s.numeroSet, ganadorSet: s.ganadorSet, tiempo: s.tiempo ?? null, deConsola: Boolean(s.iniciadoEn) })),
  });
}));

/**
 * @swagger
 * /api/eventos-set/ganador:
 *   put:
 *     summary: Carga el ganador del set (típicamente el sugerido por las marcas)
 *     description: >
 *       Mismos permisos que el resto de la captura. En un set oficial hace lo mismo que
 *       PUT /api/set-partido/{id} con ganadorSet: cierra el set y frena su timer.
 *     tags: [EventosSet]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/ganador', verificarToken, cargarRolDesdeBD, cargarSet, puedeEditar, conErrores(async (req, res) => {
  const { ganadorSet } = req.body;
  if (!['local', 'visitante', 'empate', 'pendiente'].includes(ganadorSet)) {
    return res.status(400).json({ error: 'ganadorSet inválido' });
  }
  const { ref } = req;
  if (ref.tipo === 'oficial') {
    const set = await SetPartido.findById(ref.set._id);
    set.ganadorSet = ganadorSet;
    await set.save();
    if (ganadorSet !== 'pendiente') await TimerManager.pauseSetOnly(set.partido, true);
    await TimerManager.reloadMatch(set.partido);
    if (set.iniciadoEn && set.finalizadoEn) await ubicarDesdeConsola(set.partido);
  } else {
    await PlanillaSet.updateOne({ _id: ref.set._id }, { $set: { ganadorSet } });
  }
  req.ref = await resolverSet(ref.tipo === 'oficial' ? { setPartido: ref.set._id } : { planillaSet: ref.set._id });
  res.json(await respuestaCompleta(req.ref));
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
  completarDuracionesEnSegundoPlano(partidoId);
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
