import express from 'express';
import mongoose from 'mongoose';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import PlanillaEquipo from '../../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../../models/Equipo/PlanillaEstadistica.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import SetPartido from '../../models/Partido/SetPartido.js';
import Partido from '../../models/Partido/Partido.js';
import EstadisticasJugadorSet from '../../models/Jugador/EstadisticasJugadorSet.js';
import SolicitudEdicion from '../../models/SolicitudEdicion.js';
import { normalizarVisibilidadObjetivo } from '../../services/statsApprovalService.js';
import { hasTeamPermission } from '../../services/teamPermissionService.js';
import { hasMatchPermission } from '../../services/matchPermissionService.js';
import { obtenerJugadoresElegibles } from '../../services/jugadoresElegiblesService.js';
import {
  getEquipoIdFromPlanilla,
  validarEquipoJuegaElPartido,
  obtenerPlanillaCompleta,
  eliminarPlanillaEnCascada,
  planillaEstaCerrada,
} from '../../services/planillaEquipoService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PlanillaEquipo
 *   description: >
 *     Captura de un partido hecha por uno de los equipos que lo jugó. Vive en
 *     paralelo al registro oficial de la competencia y no lo modifica: sirve para que
 *     un equipo reconstruya y analice sus propios partidos aunque la organización no
 *     haya cargado sets, presentes ni estadísticas. Solo la oficialización aprobada
 *     por la competencia traslada los números al registro oficial.
 */

/** Middleware: valida stats.* sobre el equipo dueño de la planilla de :id. */
const requirePermisoSobrePlanilla = (permission) => requireTeamPermission({
  permission,
  resolveEquipoId: (req) => getEquipoIdFromPlanilla(req.params.id),
  missingMessage: 'Planilla no encontrada o sin equipo asociado',
});

/** Carga la planilla en req.planilla y corta si ya está cerrada a ediciones. */
async function cargarPlanillaEditable(req, res, next) {
  try {
    const planilla = await PlanillaEquipo.findById(req.params.id);
    if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });

    if (planillaEstaCerrada(planilla)) {
      return res.status(409).json({
        error: planilla.estado === 'oficializada'
          ? 'La planilla ya fue oficializada y no admite cambios'
          : 'La planilla está esperando aprobación: cancelá la solicitud para poder editarla',
      });
    }

    req.planilla = planilla;
    return next();
  } catch (error) {
    console.error('Error cargando planilla:', error);
    return res.status(500).json({ error: 'Error interno cargando la planilla' });
  }
}

/**
 * @swagger
 * /api/planillas-equipo:
 *   post:
 *     summary: Crea la planilla de un equipo para un partido
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [partido, equipo]
 *             properties:
 *               partido: { type: string, format: ObjectId }
 *               equipo: { type: string, format: ObjectId }
 *               modo: { type: string, enum: [sets, directa] }
 *               autocompletarPresentes:
 *                 type: boolean
 *                 description: Precarga los presentes desde el plantel del equipo
 *     responses:
 *       201: { description: Planilla creada }
 *       403: { description: El equipo no participa del partido o faltan permisos }
 *       409: { description: El equipo ya tiene una planilla de este partido }
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.capture',
    resolveEquipoId: (req) => req.body?.equipo,
    missingMessage: 'Se requiere un equipo válido para validar permisos de captura',
  }),
  async (req, res) => {
    try {
      const { partido, modo, autocompletarPresentes } = req.body;
      const equipo = req.equipoIdPermisos;

      // El permiso valida que puedas capturar para TU equipo. Esto valida que tu
      // equipo tenga algo que ver con ESTE partido.
      const validacion = await validarEquipoJuegaElPartido(partido, equipo);
      if (!validacion.ok) {
        return res.status(validacion.status).json({ error: validacion.message });
      }

      const existente = await PlanillaEquipo.findOne({ partido, equipo }).lean();
      if (existente) {
        return res.status(409).json({
          error: 'Este equipo ya tiene una planilla de este partido',
          planillaId: existente._id,
        });
      }

      const planilla = await PlanillaEquipo.create({
        partido,
        equipo,
        modo: modo === 'directa' ? 'directa' : 'sets',
        creadoPor: req.user.uid,
      });

      if (autocompletarPresentes) {
        // Misma cascada que usa la captura del partido: convocatoria → lista de buena
        // fe → plantel vigente a la fecha del partido, con la categoría aplicada.
        // Antes esto tomaba el plantel entero filtrando solo por estado, así que traía
        // contratos de años anteriores a un partido reciente.
        const elegibles = await obtenerJugadoresElegibles({
          partidoId: String(partido),
          equipoId: String(equipo),
        });

        const candidatos = elegibles?.jugadores ?? [];

        if (candidatos.length) {
          await PlanillaPresente.insertMany(
            candidatos.map((c) => ({
              planilla: planilla._id,
              jugador: c.jugadorId,
              jugadorPartido: c.jugadorPartidoId || null,
              numero: c.numero,
              rol: 'jugador',
              creadoPor: req.user.uid,
            })),
            { ordered: false },
          );
        }
      }

      const completa = await obtenerPlanillaCompleta(planilla._id);
      return res.status(201).json(completa);
    } catch (error) {
      console.error('Error creando planilla de equipo:', error);
      return res.status(500).json({ error: 'Error interno creando la planilla' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo:
 *   get:
 *     summary: Lista las planillas de un equipo (opcionalmente de un partido)
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: equipo
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *       - in: query
 *         name: partido
 *         schema: { type: string, format: ObjectId }
 *     responses:
 *       200: { description: Listado de planillas }
 */
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.view_private',
    resolveEquipoId: (req) => req.query?.equipo,
    missingMessage: 'Se requiere el parámetro equipo para validar permisos de lectura',
  }),
  async (req, res) => {
    try {
      const filtro = { equipo: req.equipoIdPermisos };
      if (req.query.partido) filtro.partido = req.query.partido;

      const planillas = await PlanillaEquipo.find(filtro)
        .populate('partido', 'fecha estado equipoLocal equipoVisitante competencia marcadorLocal marcadorVisitante')
        .sort({ createdAt: -1 })
        .lean();

      return res.json(planillas);
    } catch (error) {
      console.error('Error listando planillas de equipo:', error);
      return res.status(500).json({ error: 'Error interno listando planillas' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/resumen:
 *   get:
 *     summary: Acumulado de todas las planillas de un equipo
 *     tags: [PlanillaEquipo]
 *     description: >
 *       Lo que alimenta la vista de análisis del equipo. Son datos propios, NO
 *       oficiales: no salen de las colecciones de la competencia ni se mezclan con
 *       ellas. Un mismo jugador puede tener números acá y otros distintos en el
 *       registro oficial, y las dos cosas son correctas en su propio marco.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: equipo
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *     responses:
 *       200: { description: Acumulado por jugador y por partido }
 */
router.get(
  '/resumen',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.view_private',
    resolveEquipoId: (req) => req.query?.equipo,
    missingMessage: 'Se requiere el parámetro equipo para validar permisos de lectura',
  }),
  async (req, res) => {
    try {
      const equipoId = req.equipoIdPermisos;

      const planillas = await PlanillaEquipo.find({ equipo: equipoId })
        .populate('partido', 'fecha estado equipoLocal equipoVisitante competencia')
        .sort({ createdAt: -1 })
        .lean();

      if (!planillas.length) {
        return res.json({ jugadores: [], partidos: [] });
      }

      const planillaIds = planillas.map((p) => p._id);

      const [presentes, estadisticas] = await Promise.all([
        PlanillaPresente.find({ planilla: { $in: planillaIds } })
          .populate('jugador', 'nombre apellido alias foto')
          .lean(),
        PlanillaEstadistica.find({ planilla: { $in: planillaIds } }).lean(),
      ]);

      const presentePorId = new Map(presentes.map((p) => [String(p._id), p]));

      // Acumulado por jugador (no por presente: el mismo jugador aparece en una
      // planilla por partido, y lo que interesa es su total en la temporada).
      const porJugador = new Map();
      const porPlanilla = new Map();

      for (const stat of estadisticas) {
        const presente = presentePorId.get(String(stat.planillaPresente));
        if (!presente) continue;

        const jugadorDoc = presente.jugador;
        const jugadorId = String(jugadorDoc?._id || jugadorDoc);

        if (!porJugador.has(jugadorId)) {
          porJugador.set(jugadorId, {
            jugadorId,
            nombre: jugadorDoc?.alias
              || [jugadorDoc?.nombre, jugadorDoc?.apellido].filter(Boolean).join(' ')
              || 'Jugador',
            foto: jugadorDoc?.foto,
            throws: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            sets: 0,
            planillas: new Set(),
          });
        }

        const acc = porJugador.get(jugadorId);
        acc.throws += stat.throws || 0;
        acc.hits += stat.hits || 0;
        acc.outs += stat.outs || 0;
        acc.catches += stat.catches || 0;
        if (stat.planillaSet) acc.sets += 1;
        acc.planillas.add(String(stat.planilla));

        const planillaKey = String(stat.planilla);
        if (!porPlanilla.has(planillaKey)) {
          porPlanilla.set(planillaKey, { throws: 0, hits: 0, outs: 0, catches: 0 });
        }
        const tot = porPlanilla.get(planillaKey);
        tot.throws += stat.throws || 0;
        tot.hits += stat.hits || 0;
        tot.outs += stat.outs || 0;
        tot.catches += stat.catches || 0;
      }

      const jugadores = [...porJugador.values()]
        .map(({ planillas: setPlanillas, ...resto }) => ({
          ...resto,
          partidos: setPlanillas.size,
        }))
        .sort((a, b) => b.hits - a.hits);

      const partidos = planillas.map((p) => ({
        planillaId: String(p._id),
        partido: p.partido || null,
        estado: p.estado,
        modo: p.modo,
        totales: porPlanilla.get(String(p._id)) || { throws: 0, hits: 0, outs: 0, catches: 0 },
      }));

      return res.json({ jugadores, partidos });
    } catch (error) {
      console.error('Error armando resumen de planillas:', error);
      return res.status(500).json({ error: 'Error interno armando el resumen' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/filas:
 *   get:
 *     summary: Todas las estadísticas del equipo en formato largo, para analizar
 *     tags: [PlanillaEquipo]
 *     description: >
 *       Una fila por jugador y set, con todas sus dimensiones ya resueltas — partido,
 *       rival, categoría, modalidad, número de set y quién ganó ese set. Es lo que
 *       consume la vista de análisis cruzado: el cliente agrupa por las dimensiones que
 *       elija el usuario sin volver a pedir nada.
 *
 *       Son datos propios del equipo, no oficiales.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: equipo
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *     responses:
 *       200: { description: Filas en formato largo }
 */
router.get(
  '/filas',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.view_private',
    resolveEquipoId: (req) => req.query?.equipo,
    missingMessage: 'Se requiere el parámetro equipo para validar permisos de lectura',
  }),
  async (req, res) => {
    try {
      const equipoId = req.equipoIdPermisos;

      const planillas = await PlanillaEquipo.find({ equipo: equipoId }).lean();
      if (!planillas.length) return res.json({ filas: [] });

      const planillaIds = planillas.map((p) => p._id);

      const [presentes, sets, estadisticas, partidos] = await Promise.all([
        PlanillaPresente.find({ planilla: { $in: planillaIds } })
          .populate('jugador', 'nombre apellido alias')
          .lean(),
        PlanillaSet.find({ planilla: { $in: planillaIds } }).lean(),
        PlanillaEstadistica.find({ planilla: { $in: planillaIds } }).lean(),
        Partido.find({ _id: { $in: planillas.map((p) => p.partido) } })
          .populate('equipoLocal', 'nombre')
          .populate('equipoVisitante', 'nombre')
          .populate('competencia', 'categoria modalidad')
          .select('fecha equipoLocal equipoVisitante competencia')
          .lean(),
      ]);

      const porId = (arr) => new Map(arr.map((x) => [String(x._id), x]));
      const presentePorId = porId(presentes);
      const setPorId = porId(sets);
      const partidoPorId = porId(partidos);
      const planillaPorId = porId(planillas);

      const nombreDe = (j) => {
        if (!j || typeof j === 'string') return 'Jugador';
        return j.alias || [j.nombre, j.apellido].filter(Boolean).join(' ').trim() || 'Jugador';
      };

      const filas = [];
      for (const stat of estadisticas) {
        const presente = presentePorId.get(String(stat.planillaPresente));
        const planilla = planillaPorId.get(String(stat.planilla));
        if (!presente || !planilla) continue;

        const partido = partidoPorId.get(String(planilla.partido));
        const esLocal = String(partido?.equipoLocal?._id) === String(equipoId);
        const rival = esLocal ? partido?.equipoVisitante?.nombre : partido?.equipoLocal?.nombre;

        const setDoc = stat.planillaSet ? setPorId.get(String(stat.planillaSet)) : null;

        // El ganador del set se guarda como local/visitante; se traduce a la óptica del
        // equipo, que es como se lee el análisis: "en los sets que ganamos…".
        let resultadoSet = 'sin definir';
        if (setDoc?.ganadorSet === 'empate') resultadoSet = 'empate';
        else if (setDoc?.ganadorSet === 'local') resultadoSet = esLocal ? 'ganado' : 'perdido';
        else if (setDoc?.ganadorSet === 'visitante') resultadoSet = esLocal ? 'perdido' : 'ganado';

        filas.push({
          jugadorId: String(presente.jugador?._id || presente.jugador),
          jugador: nombreDe(presente.jugador),
          partidoId: String(planilla.partido),
          fecha: partido?.fecha ?? null,
          rival: rival || 'Rival',
          categoria: partido?.competencia?.categoria ?? 'Amistoso',
          modalidad: partido?.competencia?.modalidad ?? 'Sin modalidad',
          numeroSet: setDoc?.numeroSet ?? null,
          resultadoSet,
          throws: stat.throws || 0,
          hits: stat.hits || 0,
          outs: stat.outs || 0,
          catches: stat.catches || 0,
          survive: Boolean(stat.survive),
        });
      }

      return res.json({ filas });
    } catch (error) {
      console.error('Error armando filas de planillas:', error);
      return res.status(500).json({ error: 'Error interno armando las filas' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}:
 *   get:
 *     summary: Planilla completa - presentes, sets y estadísticas
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Planilla completa }
 *       404: { description: Planilla no encontrada }
 */
router.get(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.view_private'),
  async (req, res) => {
    try {
      const completa = await obtenerPlanillaCompleta(req.params.id);
      if (!completa) return res.status(404).json({ error: 'Planilla no encontrada' });
      return res.json(completa);
    } catch (error) {
      console.error('Error obteniendo planilla:', error);
      return res.status(500).json({ error: 'Error interno obteniendo la planilla' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/revision:
 *   get:
 *     summary: Planilla y su contraparte oficial, lado a lado
 *     tags: [PlanillaEquipo]
 *     description: >
 *       Lo que mira el organizador antes de aprobar una oficialización. A diferencia
 *       de GET /{id}, que exige stats.view_private sobre el equipo, acá alcanza con
 *       poder ver datos privados del partido — que es lo que tiene quien gestiona la
 *       competencia. Sin esto el aprobador decidiría a ciegas.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Planilla y datos oficiales del partido }
 *       403: { description: Sin permisos sobre el partido ni sobre el equipo }
 */
router.get(
  '/:id/revision',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const planilla = await PlanillaEquipo.findById(req.params.id).select('partido equipo').lean();
      if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });

      const puedeRevisar = await hasMatchPermission({
        partidoId: String(planilla.partido),
        usuarioId: req.user?.uid,
        rolGlobal: req.user?.rol,
        permission: 'match.view_private',
      });

      // El propio equipo también entra por acá, para ver la comparación con lo oficial.
      const esDelEquipo = puedeRevisar ? false : await hasTeamPermission({
        equipoId: String(planilla.equipo),
        usuarioId: req.user?.uid,
        rolGlobal: req.user?.rol,
        permission: 'stats.view_private',
      });

      if (!puedeRevisar && !esDelEquipo) {
        return res.status(403).json({ error: 'No tenés permisos para revisar esta planilla' });
      }

      const completa = await obtenerPlanillaCompleta(planilla._id);

      // Contraparte oficial: solo la del equipo de la planilla, que es lo único que
      // la oficialización puede llegar a tocar.
      const [setsOficiales, convocatoria] = await Promise.all([
        SetPartido.find({ partido: planilla.partido }).sort({ numeroSet: 1 }).lean(),
        JugadorPartido.find({ partido: planilla.partido, equipo: planilla.equipo })
          .populate('jugador', 'nombre apellido alias')
          .lean(),
      ]);

      const estadisticasOficiales = convocatoria.length
        ? await EstadisticasJugadorSet.find({
            jugadorPartido: { $in: convocatoria.map((jp) => jp._id) },
          }).lean()
        : [];

      return res.json({
        planilla: completa,
        oficial: {
          sets: setsOficiales,
          convocatoria,
          estadisticas: estadisticasOficiales,
        },
      });
    } catch (error) {
      console.error('Error obteniendo revisión de planilla:', error);
      return res.status(500).json({ error: 'Error interno obteniendo la revisión' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/presentes:
 *   post:
 *     summary: Alta en lote de presentes
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [presentes]
 *             properties:
 *               presentes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [jugador]
 *                   properties:
 *                     jugador: { type: string, format: ObjectId }
 *                     numero: { type: integer }
 *                     rol: { type: string, enum: [jugador, entrenador] }
 *     responses:
 *       200: { description: Presentes actualizados }
 */
router.post(
  '/:id/presentes',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.capture'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const filas = Array.isArray(req.body?.presentes) ? req.body.presentes : [];
      if (!filas.length) {
        return res.status(400).json({ error: 'presentes debe ser un array con al menos un jugador' });
      }

      const { planilla } = req;
      const convocatoria = await JugadorPartido.find({
        partido: planilla.partido,
        equipo: planilla.equipo,
      }).select('jugador').lean();
      const porJugador = new Map(convocatoria.map((jp) => [String(jp.jugador), jp._id]));

      for (const fila of filas) {
        if (!fila?.jugador || !mongoose.Types.ObjectId.isValid(fila.jugador)) continue;

        await PlanillaPresente.findOneAndUpdate(
          { planilla: planilla._id, jugador: fila.jugador },
          {
            planilla: planilla._id,
            jugador: fila.jugador,
            jugadorPartido: porJugador.get(String(fila.jugador)) || null,
            numero: Number.isFinite(Number(fila.numero)) ? Number(fila.numero) : undefined,
            rol: fila.rol === 'entrenador' ? 'entrenador' : 'jugador',
            creadoPor: req.user.uid,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      }

      const completa = await obtenerPlanillaCompleta(planilla._id);
      return res.json(completa);
    } catch (error) {
      console.error('Error guardando presentes de planilla:', error);
      return res.status(500).json({ error: 'Error interno guardando presentes' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/presentes/{presenteId}:
 *   delete:
 *     summary: Saca a un jugador de la planilla, con sus estadísticas
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Presente eliminado }
 */
router.delete(
  '/:id/presentes/:presenteId',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.edit'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const { presenteId } = req.params;
      // validarObjectId solo mira `:id`; sin esto un presenteId inválido tira
      // CastError y sale como 500 en vez de 400.
      if (!mongoose.Types.ObjectId.isValid(presenteId)) {
        return res.status(400).json({ error: 'ID de presente inválido' });
      }

      const presente = await PlanillaPresente.findOne({
        _id: presenteId,
        planilla: req.planilla._id,
      }).lean();

      if (!presente) return res.status(404).json({ error: 'Presente no encontrado en esta planilla' });

      await PlanillaEstadistica.deleteMany({ planillaPresente: presenteId });
      await PlanillaPresente.deleteOne({ _id: presenteId });

      return res.status(204).send();
    } catch (error) {
      console.error('Error eliminando presente de planilla:', error);
      return res.status(500).json({ error: 'Error interno eliminando el presente' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/sets:
 *   post:
 *     summary: Crea o actualiza un set de la planilla
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numeroSet]
 *             properties:
 *               numeroSet: { type: integer }
 *               ganadorSet: { type: string, enum: [local, visitante, empate, pendiente] }
 *     responses:
 *       200: { description: Set guardado }
 */
router.post(
  '/:id/sets',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.capture'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const numeroSet = Number(req.body?.numeroSet);
      if (!Number.isFinite(numeroSet) || numeroSet < 1) {
        return res.status(400).json({ error: 'numeroSet debe ser un entero mayor o igual a 1' });
      }

      const { planilla } = req;

      // Si el organizador ya creó ese set, lo referenciamos. No lo tocamos: su
      // resultado sigue siendo del organizador.
      const oficial = await SetPartido.findOne({ partido: planilla.partido, numeroSet })
        .select('_id')
        .lean();

      const set = await PlanillaSet.findOneAndUpdate(
        { planilla: planilla._id, numeroSet },
        {
          planilla: planilla._id,
          numeroSet,
          ganadorSet: req.body?.ganadorSet || 'pendiente',
          setPartido: oficial?._id || null,
          creadoPor: req.user.uid,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      return res.json(set);
    } catch (error) {
      console.error('Error guardando set de planilla:', error);
      return res.status(500).json({ error: 'Error interno guardando el set' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/sets/{setId}:
 *   delete:
 *     summary: Elimina un set de la planilla y sus estadísticas
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Set eliminado }
 */
router.delete(
  '/:id/sets/:setId',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.edit'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const { setId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(setId)) {
        return res.status(400).json({ error: 'ID de set inválido' });
      }

      const set = await PlanillaSet.findOne({ _id: setId, planilla: req.planilla._id }).lean();
      if (!set) return res.status(404).json({ error: 'Set no encontrado en esta planilla' });

      await PlanillaEstadistica.deleteMany({ planillaSet: setId });
      await PlanillaSet.deleteOne({ _id: setId });

      return res.status(204).send();
    } catch (error) {
      console.error('Error eliminando set de planilla:', error);
      return res.status(500).json({ error: 'Error interno eliminando el set' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/estadisticas:
 *   put:
 *     summary: Upsert en lote de las estadísticas de un set (o de los totales)
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estadisticas]
 *             properties:
 *               planillaSet:
 *                 type: string
 *                 format: ObjectId
 *                 description: Omitir en modo 'directa' para cargar totales del partido
 *               estadisticas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [planillaPresente]
 *                   properties:
 *                     planillaPresente: { type: string, format: ObjectId }
 *                     throws: { type: integer }
 *                     hits: { type: integer }
 *                     outs: { type: integer }
 *                     catches: { type: integer }
 *                     survive: { type: boolean }
 *     responses:
 *       200: { description: Estadísticas guardadas }
 */
router.put(
  '/:id/estadisticas',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.edit'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const filas = Array.isArray(req.body?.estadisticas) ? req.body.estadisticas : [];
      if (!filas.length) {
        return res.status(400).json({ error: 'estadisticas debe ser un array con al menos una fila' });
      }

      const { planilla } = req;
      const planillaSetId = req.body?.planillaSet || null;

      if (planillaSetId) {
        if (!mongoose.Types.ObjectId.isValid(planillaSetId)) {
          return res.status(400).json({ error: 'planillaSet inválido' });
        }
        const set = await PlanillaSet.findOne({ _id: planillaSetId, planilla: planilla._id }).select('_id').lean();
        if (!set) return res.status(400).json({ error: 'El set no pertenece a esta planilla' });
      } else if (planilla.modo === 'sets') {
        return res.status(400).json({ error: 'En modo sets hay que indicar a qué set pertenecen las estadísticas' });
      }

      // Los presentes se validan contra la planilla: una fila no puede apuntar a un
      // jugador de otra planilla ni de otro equipo.
      const presentes = await PlanillaPresente.find({ planilla: planilla._id }).select('_id').lean();
      const idsValidos = new Set(presentes.map((p) => String(p._id)));

      const guardadas = [];
      for (const fila of filas) {
        const presenteId = fila?.planillaPresente;
        if (!presenteId || !idsValidos.has(String(presenteId))) continue;

        const guardada = await PlanillaEstadistica.findOneAndUpdate(
          { planillaSet: planillaSetId, planillaPresente: presenteId },
          {
            planilla: planilla._id,
            planillaSet: planillaSetId,
            planillaPresente: presenteId,
            throws: Math.max(0, Number(fila.throws) || 0),
            hits: Math.max(0, Number(fila.hits) || 0),
            outs: Math.max(0, Number(fila.outs) || 0),
            catches: Math.max(0, Number(fila.catches) || 0),
            survive: Boolean(fila.survive),
            creadoPor: req.user.uid,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        guardadas.push(guardada);
      }

      return res.json(guardadas);
    } catch (error) {
      console.error('Error guardando estadísticas de planilla:', error);
      return res.status(500).json({ error: 'Error interno guardando estadísticas' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/solicitar-oficializacion:
 *   post:
 *     summary: Pide que la competencia adopte esta planilla como dato oficial
 *     tags: [PlanillaEquipo]
 *     description: >
 *       Genera UNA sola solicitud con la planilla entera. Si el partido es amistoso no
 *       hay organizador que apruebe y la planilla se oficializa en el acto, con el
 *       mismo criterio que usa encolarSolicitudStatsLiga.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Solicitud creada o planilla oficializada }
 */
router.post(
  '/:id/solicitar-oficializacion',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.capture'),
  cargarPlanillaEditable,
  async (req, res) => {
    try {
      const { planilla } = req;
      const visibilidadObjetivo = normalizarVisibilidadObjetivo(req.body?.visibilidadObjetivo);

      const estadisticas = await PlanillaEstadistica.countDocuments({ planilla: planilla._id });
      if (!estadisticas) {
        return res.status(400).json({ error: 'La planilla no tiene ninguna estadística cargada' });
      }

      // Un set sin ganador se materializa como SetPartido 'en_juego'. Además de quedar
      // mal en un partido finalizado, el marcador del partido se deriva de los sets
      // FINALIZADOS: si alguien recalcula después, esos sets cuentan cero y el
      // resultado oficial se va a 0-0. Se corta acá, antes de que exista el problema.
      if (planilla.modo === 'sets') {
        const sinGanador = await PlanillaSet.find({
          planilla: planilla._id,
          $or: [{ ganadorSet: 'pendiente' }, { ganadorSet: { $exists: false } }],
        }).select('numeroSet').lean();

        if (sinGanador.length) {
          const numeros = sinGanador.map((s) => s.numeroSet).sort((a, b) => a - b);
          return res.status(400).json({
            error: `Falta indicar quién ganó ${numeros.length === 1 ? 'el set' : 'los sets'} ${numeros.join(', ')}. Sin eso el set entra al partido como no jugado.`,
            setsSinGanador: numeros,
          });
        }
      }

      const validacion = await validarEquipoJuegaElPartido(planilla.partido, planilla.equipo);
      if (!validacion.ok) {
        return res.status(validacion.status).json({ error: validacion.message });
      }

      planilla.visibilidadObjetivo = visibilidadObjetivo;

      // Amistoso: sin competencia no hay organizador que apruebe. La autoridad es el
      // propio equipo, así que se aplica directo.
      if (!validacion.partido.competencia) {
        const { aplicarPlanillaOficializada } = await import('../../services/planillaOficializacionService.js');
        await aplicarPlanillaOficializada({
          planillaId: planilla._id,
          visibilidad: visibilidadObjetivo,
          uid: req.user.uid,
        });
        return res.json({
          oficializada: true,
          motivo: 'amistoso',
          planilla: await obtenerPlanillaCompleta(planilla._id),
        });
      }

      const solicitud = await SolicitudEdicion.create({
        tipo: 'planilla-equipo-oficializacion',
        entidad: planilla._id,
        creadoPor: req.user.uid,
        datosPropuestos: {
          planillaId: String(planilla._id),
          partidoId: String(planilla.partido),
          equipoId: String(planilla.equipo),
          modo: planilla.modo,
          visibilidadObjetivo,
        },
      });

      planilla.estado = 'pendiente_oficializacion';
      planilla.solicitudOficializacion = solicitud._id;
      await planilla.save();

      return res.json({ oficializada: false, solicitudId: solicitud._id });
    } catch (error) {
      console.error('Error solicitando oficialización de planilla:', error);
      return res.status(500).json({ error: 'Error interno solicitando la oficialización' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}/cancelar-oficializacion:
 *   post:
 *     summary: Retira la solicitud y devuelve la planilla a borrador
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Solicitud cancelada }
 */
router.post(
  '/:id/cancelar-oficializacion',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.capture'),
  async (req, res) => {
    try {
      const planilla = await PlanillaEquipo.findById(req.params.id);
      if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });

      if (planilla.estado !== 'pendiente_oficializacion') {
        return res.status(409).json({ error: 'La planilla no tiene una solicitud pendiente' });
      }

      if (planilla.solicitudOficializacion) {
        await SolicitudEdicion.findOneAndUpdate(
          { _id: planilla.solicitudOficializacion, estado: 'pendiente' },
          { estado: 'cancelado' },
        );
      }

      planilla.estado = 'borrador';
      planilla.solicitudOficializacion = undefined;
      await planilla.save();

      return res.json({ estado: planilla.estado });
    } catch (error) {
      console.error('Error cancelando oficialización de planilla:', error);
      return res.status(500).json({ error: 'Error interno cancelando la solicitud' });
    }
  },
);

/**
 * @swagger
 * /api/planillas-equipo/{id}:
 *   delete:
 *     summary: Elimina la planilla y todo su contenido
 *     tags: [PlanillaEquipo]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Planilla eliminada }
 *       409: { description: La planilla ya fue oficializada }
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  requirePermisoSobrePlanilla('stats.edit'),
  async (req, res) => {
    try {
      const planilla = await PlanillaEquipo.findById(req.params.id).lean();
      if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' });

      // Borrar una planilla oficializada dejaría las estadísticas oficiales sin
      // origen documentado. El registro oficial ya no depende de ella, pero la
      // trazabilidad sí.
      if (planilla.estado === 'oficializada') {
        return res.status(409).json({ error: 'La planilla ya fue oficializada y no se puede eliminar' });
      }

      await eliminarPlanillaEnCascada(planilla._id);
      return res.status(204).send();
    } catch (error) {
      console.error('Error eliminando planilla:', error);
      return res.status(500).json({ error: 'Error interno eliminando la planilla' });
    }
  },
);

export default router;
