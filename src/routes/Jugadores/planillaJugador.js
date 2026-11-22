import express from 'express';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import {
  resumenJugador,
  partidosDisponibles,
  crearPlanillaJugador,
  guardarMisNumeros,
  eliminarPlanillaJugador,
  aportar,
  retirarAporte,
  listarAportes,
  resolverAporte,
} from '../../services/planillaJugadorService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PlanillaJugador
 *   description: >
 *     "Mis números": la planilla de un jugador sobre sus propios partidos, sólo sus
 *     filas y en totales. Nunca escribe en lo oficial; el jugador puede aportarla a la
 *     planilla de su equipo y el cuerpo técnico la acepta o la descarta.
 */

/** Adapta el `{ status, data, error }` de los services a la respuesta HTTP. */
const responder = (res, r) => {
  if (r.status === 204) return res.status(204).end();
  if (r.status >= 400) return res.status(r.status).json({ error: r.error, ...(r.data || {}) });
  return res.status(r.status).json(r.data);
};

const manejar = (fn, mensaje) => async (req, res) => {
  try {
    return responder(res, await fn(req));
  } catch (error) {
    console.error(`${mensaje}:`, error);
    return res.status(500).json({ error: `Error interno: ${mensaje.toLowerCase()}` });
  }
};

const auth = [verificarToken, cargarRolDesdeBD];

/**
 * @swagger
 * /api/planillas-jugador/resumen:
 *   get:
 *     summary: Por partido, lo oficial, la planilla del equipo y la propia del jugador
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: jugador, required: true, schema: { type: string, format: ObjectId } }
 *     responses:
 *       200: { description: Lista de partidos con las tres versiones (cada una puede ser null) }
 */
router.get('/resumen', ...auth, manejar((req) => resumenJugador(req.query.jugador, req.user), 'Armando el resumen del jugador'));

/**
 * @swagger
 * /api/planillas-jugador/partidos-disponibles:
 *   get:
 *     summary: Partidos de los equipos del jugador sobre los que todavía no tiene planilla
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: jugador, required: true, schema: { type: string, format: ObjectId } }
 *     responses:
 *       200: { description: Partidos jugados o en juego, con miEquipo }
 */
router.get('/partidos-disponibles', ...auth, manejar((req) => partidosDisponibles(req.query.jugador, req.user), 'Listando partidos disponibles'));

/**
 * @swagger
 * /api/planillas-jugador/aportes:
 *   get:
 *     summary: Bandeja del cuerpo técnico - aportes de jugadores para su equipo
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: equipo, required: true, schema: { type: string, format: ObjectId } }
 *       - { in: query, name: estado, schema: { type: string, enum: [pendiente, aceptado, descartado, todos] } }
 *     responses:
 *       200: { description: Aportes con los números del jugador y lo que ya dice la planilla del equipo }
 */
router.get('/aportes', ...auth, manejar((req) => listarAportes(req.query.equipo, req.user, { estado: req.query.estado || 'pendiente' }), 'Listando aportes'));

/**
 * @swagger
 * /api/planillas-jugador:
 *   post:
 *     summary: Abre la planilla del jugador para un partido
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [partido, jugador]
 *             properties:
 *               partido: { type: string, format: ObjectId }
 *               jugador: { type: string, format: ObjectId }
 *     responses:
 *       201: { description: Creada }
 *       403: { description: No administra al jugador o no tenía contrato con ninguno de los equipos }
 *       409: { description: Ya existe o el partido no se jugó }
 */
router.post('/', ...auth, manejar((req) => crearPlanillaJugador({ partidoId: req.body?.partido, jugadorId: req.body?.jugador, usuario: req.user }), 'Creando la planilla del jugador'));

/**
 * @swagger
 * /api/planillas-jugador/{id}/numeros:
 *   put:
 *     summary: Guarda los totales del jugador en su planilla
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               throws: { type: integer }
 *               hits: { type: integer }
 *               outs: { type: integer }
 *               catches: { type: integer }
 *               notas: { type: string }
 *     responses:
 *       200: { description: Guardado }
 *       409: { description: Hay un aporte pendiente }
 */
router.put('/:id/numeros', validarObjectId, ...auth, manejar((req) => guardarMisNumeros({ planillaId: req.params.id, body: req.body || {}, usuario: req.user }), 'Guardando los números'));

router.delete('/:id', validarObjectId, ...auth, manejar((req) => eliminarPlanillaJugador({ planillaId: req.params.id, usuario: req.user }), 'Eliminando la planilla del jugador'));

/**
 * @swagger
 * /api/planillas-jugador/{id}/aporte:
 *   post:
 *     summary: Ofrece los números al cuerpo técnico del equipo del partido
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Retira un aporte pendiente
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/aporte', validarObjectId, ...auth, manejar((req) => aportar({ planillaId: req.params.id, usuario: req.user }), 'Aportando los números'));
router.delete('/:id/aporte', validarObjectId, ...auth, manejar((req) => retirarAporte({ planillaId: req.params.id, usuario: req.user }), 'Retirando el aporte'));

/**
 * @swagger
 * /api/planillas-jugador/{id}/aporte/{accion}:
 *   post:
 *     summary: El cuerpo técnico acepta (copia a la planilla del equipo) o descarta un aporte
 *     tags: [PlanillaJugador]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: accion, required: true, schema: { type: string, enum: [aceptar, descartar] } }
 *     responses:
 *       200: { description: Resuelto }
 *       409: { description: Planilla del equipo por set o cerrada, o aporte ya resuelto }
 */
router.post('/:id/aporte/:accion', validarObjectId, ...auth, manejar((req) => resolverAporte({ planillaId: req.params.id, accion: req.params.accion, motivo: req.body?.motivo, usuario: req.user }), 'Resolviendo el aporte'));

export default router;
