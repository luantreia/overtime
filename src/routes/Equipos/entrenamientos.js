import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import Entrenamiento from '../../models/Equipo/Entrenamiento.js';
import AsistenciaEntrenamiento from '../../models/Equipo/AsistenciaEntrenamiento.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';

const router = express.Router();

/**
 * Entrenamientos del equipo y su asistencia.
 *
 * Todo lo de acá es privado del equipo: no lo aprueba ninguna organización y no toca datos de
 * competencia. Las escrituras piden `trainings.manage` (que tienen entrenador y preparador
 * físico); las lecturas piden `stats.view_private`, el permiso que ya significa "ver los datos
 * internos del equipo" — no hace falta una segunda jerarquía de permisos en paralelo.
 */

const equipoDelEntrenamiento = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const doc = await Entrenamiento.findById(id).select('equipo').lean();
  return doc ? String(doc.equipo) : null;
};

const permisoPorEquipoEnQuery = (permission) =>
  requireTeamPermission({
    permission,
    resolveEquipoId: (req) => req.query?.equipo ?? req.body?.equipo,
    missingMessage: 'Se requiere el parámetro equipo',
  });

const permisoPorEntrenamiento = (permission) =>
  requireTeamPermission({
    permission,
    resolveEquipoId: (req) => equipoDelEntrenamiento(req.params.id),
    missingMessage: 'Entrenamiento no encontrado',
  });

const nombreDe = (j) => {
  if (!j || typeof j === 'string') return 'Jugador';
  return j.alias || [j.nombre, j.apellido].filter(Boolean).join(' ').trim() || 'Jugador';
};

/**
 * @swagger
 * /api/entrenamientos:
 *   get:
 *     summary: Entrenamientos de un equipo, con el recuento de asistencia de cada uno
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEquipoEnQuery('stats.view_private'),
  async (req, res) => {
    try {
      const equipoId = req.equipoIdPermisos;
      const { desde, hasta } = req.query;

      const filtro = { equipo: equipoId };
      const rango = {};
      const d = desde ? new Date(desde) : null;
      const h = hasta ? new Date(hasta) : null;
      if (d && !Number.isNaN(d.getTime())) rango.$gte = d;
      if (h && !Number.isNaN(h.getTime())) rango.$lte = h;
      if (Object.keys(rango).length) filtro.fecha = rango;

      const entrenamientos = await Entrenamiento.find(filtro).sort({ fecha: -1 }).lean();
      if (entrenamientos.length === 0) return res.json({ entrenamientos: [] });

      // Los recuentos en lote: una consulta para todos, no una por entrenamiento.
      const asistencias = await AsistenciaEntrenamiento.find({
        entrenamiento: { $in: entrenamientos.map((e) => e._id) },
      })
        .select('entrenamiento estado')
        .lean();

      const conteos = new Map();
      for (const a of asistencias) {
        const clave = String(a.entrenamiento);
        const acc = conteos.get(clave) ?? { convocado: 0, presente: 0, tarde: 0, ausente: 0, justificado: 0 };
        acc[a.estado] = (acc[a.estado] ?? 0) + 1;
        conteos.set(clave, acc);
      }

      return res.json({
        entrenamientos: entrenamientos.map((e) => ({
          ...e,
          _id: String(e._id),
          equipo: String(e.equipo),
          asistencia: conteos.get(String(e._id)) ?? {
            convocado: 0,
            presente: 0,
            tarde: 0,
            ausente: 0,
            justificado: 0,
          },
        })),
      });
    } catch (error) {
      console.error('Error listando entrenamientos:', error);
      return res.status(500).json({ error: 'Error al listar los entrenamientos' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos/resumen:
 *   get:
 *     summary: Asistencia acumulada por jugador
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/resumen',
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEquipoEnQuery('stats.view_private'),
  async (req, res) => {
    try {
      const equipoId = req.equipoIdPermisos;

      // Sólo los entrenamientos realizados entran en el porcentaje: uno programado todavía no
      // pasó, y uno cancelado no lo faltó nadie. Contarlos hundiría el número de todo el plantel.
      const entrenamientos = await Entrenamiento.find({ equipo: equipoId, estado: 'realizado' })
        .select('_id')
        .lean();

      const contratos = await JugadorEquipo.find({ equipo: equipoId, estado: 'aceptado' })
        .select('jugador')
        .populate('jugador', 'nombre apellido alias')
        .lean();

      if (entrenamientos.length === 0) {
        return res.json({
          totalEntrenamientos: 0,
          jugadores: contratos.map((c) => ({
            jugadorId: String(c.jugador?._id ?? c.jugador),
            jugador: nombreDe(c.jugador),
            presente: 0,
            tarde: 0,
            ausente: 0,
            justificado: 0,
            convocado: 0,
            porcentaje: null,
          })),
        });
      }

      const asistencias = await AsistenciaEntrenamiento.find({
        entrenamiento: { $in: entrenamientos.map((e) => e._id) },
      })
        .select('jugador estado')
        .lean();

      const porJugador = new Map();
      for (const c of contratos) {
        const id = String(c.jugador?._id ?? c.jugador);
        porJugador.set(id, {
          jugadorId: id,
          jugador: nombreDe(c.jugador),
          presente: 0,
          tarde: 0,
          ausente: 0,
          justificado: 0,
          convocado: 0,
        });
      }

      for (const a of asistencias) {
        const item = porJugador.get(String(a.jugador));
        if (!item) continue; // ya no está en el plantel; su historial no ensucia el del equipo actual
        item[a.estado] = (item[a.estado] ?? 0) + 1;
      }

      const jugadores = [...porJugador.values()]
        .map((j) => {
          // `justificado` no suma ni resta: no es presencia, pero tampoco una falta que se le
          // pueda reprochar a nadie. `convocado` sin resolver tampoco entra — es un dato que
          // nadie cargó, no una ausencia.
          const asistio = j.presente + j.tarde;
          const computables = asistio + j.ausente;
          return { ...j, porcentaje: computables > 0 ? asistio / computables : null };
        })
        .sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1) || a.jugador.localeCompare(b.jugador, 'es'));

      return res.json({ totalEntrenamientos: entrenamientos.length, jugadores });
    } catch (error) {
      console.error('Error armando el resumen de asistencia:', error);
      return res.status(500).json({ error: 'Error al armar el resumen de asistencia' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos:
 *   post:
 *     summary: Crea un entrenamiento y convoca al plantel vigente
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEquipoEnQuery('trainings.manage'),
  async (req, res) => {
    try {
      const equipoId = req.equipoIdPermisos;
      const { fecha, duracionMinutos, lugar, tipo, titulo, notas, convocarPlantel = true } = req.body ?? {};

      const cuando = fecha ? new Date(fecha) : null;
      if (!cuando || Number.isNaN(cuando.getTime())) {
        return res.status(400).json({ error: 'La fecha del entrenamiento es obligatoria y debe ser válida' });
      }

      const entrenamiento = await Entrenamiento.create({
        equipo: equipoId,
        fecha: cuando,
        duracionMinutos,
        lugar,
        tipo,
        titulo,
        notas,
        creadoPor: req.user.uid,
      });

      // Convocar al plantel entero por defecto: lo normal es que entrenen todos, y marcar
      // las excepciones es mucho menos trabajo que cargar veinte jugadores a mano cada vez.
      if (convocarPlantel) {
        const contratos = await JugadorEquipo.find({ equipo: equipoId, estado: 'aceptado' })
          .select('jugador')
          .lean();
        if (contratos.length > 0) {
          await AsistenciaEntrenamiento.insertMany(
            contratos.map((c) => ({ entrenamiento: entrenamiento._id, jugador: c.jugador })),
            { ordered: false }
          );
        }
      }

      return res.status(201).json({ ...entrenamiento.toObject(), _id: String(entrenamiento._id) });
    } catch (error) {
      console.error('Error creando entrenamiento:', error);
      return res.status(500).json({ error: 'Error al crear el entrenamiento' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos/{id}:
 *   get:
 *     summary: Un entrenamiento con la asistencia de cada jugador
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEntrenamiento('stats.view_private'),
  async (req, res) => {
    try {
      const entrenamiento = await Entrenamiento.findById(req.params.id).lean();
      if (!entrenamiento) return res.status(404).json({ error: 'Entrenamiento no encontrado' });

      const asistencias = await AsistenciaEntrenamiento.find({ entrenamiento: req.params.id })
        .populate('jugador', 'nombre apellido alias')
        .lean();

      return res.json({
        ...entrenamiento,
        _id: String(entrenamiento._id),
        equipo: String(entrenamiento.equipo),
        asistencias: asistencias
          .map((a) => ({
            _id: String(a._id),
            jugadorId: String(a.jugador?._id ?? a.jugador),
            jugador: nombreDe(a.jugador),
            estado: a.estado,
            minutosTarde: a.minutosTarde ?? 0,
            notas: a.notas ?? '',
          }))
          .sort((a, b) => a.jugador.localeCompare(b.jugador, 'es')),
      });
    } catch (error) {
      console.error('Error obteniendo entrenamiento:', error);
      return res.status(500).json({ error: 'Error al obtener el entrenamiento' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos/{id}:
 *   put:
 *     summary: Edita los datos de un entrenamiento
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEntrenamiento('trainings.manage'),
  async (req, res) => {
    try {
      const permitidos = ['fecha', 'duracionMinutos', 'lugar', 'tipo', 'titulo', 'notas', 'estado'];
      const cambios = {};
      for (const campo of permitidos) {
        if (req.body?.[campo] !== undefined) cambios[campo] = req.body[campo];
      }

      if (cambios.fecha) {
        const cuando = new Date(cambios.fecha);
        if (Number.isNaN(cuando.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
        cambios.fecha = cuando;
      }

      const actualizado = await Entrenamiento.findByIdAndUpdate(req.params.id, { $set: cambios }, {
        new: true,
        runValidators: true,
      }).lean();

      if (!actualizado) return res.status(404).json({ error: 'Entrenamiento no encontrado' });
      return res.json({ ...actualizado, _id: String(actualizado._id) });
    } catch (error) {
      console.error('Error editando entrenamiento:', error);
      return res.status(500).json({ error: 'Error al editar el entrenamiento' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos/{id}/asistencias:
 *   put:
 *     summary: Marca la asistencia del entrenamiento en lote
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  '/:id/asistencias',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEntrenamiento('trainings.manage'),
  async (req, res) => {
    try {
      const filas = Array.isArray(req.body?.asistencias) ? req.body.asistencias : [];
      if (filas.length === 0) {
        return res.status(400).json({ error: 'asistencias debe ser un array con al menos un jugador' });
      }

      const ESTADOS = new Set(['convocado', 'presente', 'tarde', 'ausente', 'justificado']);
      const operaciones = [];
      for (const fila of filas) {
        if (!mongoose.Types.ObjectId.isValid(fila?.jugadorId)) continue;
        if (!ESTADOS.has(fila?.estado)) continue;
        operaciones.push({
          updateOne: {
            filter: { entrenamiento: req.params.id, jugador: fila.jugadorId },
            update: {
              $set: {
                estado: fila.estado,
                minutosTarde: fila.estado === 'tarde' ? Number(fila.minutosTarde) || 0 : 0,
                notas: typeof fila.notas === 'string' ? fila.notas : '',
              },
            },
            // upsert: un jugador que se sumó al plantel después de crear el entrenamiento no
            // tiene fila, y marcarle la asistencia no debería fallar por eso.
            upsert: true,
          },
        });
      }

      if (operaciones.length === 0) {
        return res.status(400).json({ error: 'Ninguna fila de asistencia era válida' });
      }

      await AsistenciaEntrenamiento.bulkWrite(operaciones, { ordered: false });

      // Marcar asistencia es lo que convierte un entrenamiento en "realizado". Es el único
      // momento en que sabemos con certeza que la sesión ocurrió.
      await Entrenamiento.findOneAndUpdate(
        { _id: req.params.id, estado: 'programado' },
        { $set: { estado: 'realizado' } }
      );

      return res.json({ ok: true, actualizadas: operaciones.length });
    } catch (error) {
      console.error('Error guardando asistencias:', error);
      return res.status(500).json({ error: 'Error al guardar la asistencia' });
    }
  }
);

/**
 * @swagger
 * /api/entrenamientos/{id}:
 *   delete:
 *     summary: Elimina un entrenamiento y su asistencia
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  permisoPorEntrenamiento('trainings.manage'),
  async (req, res) => {
    try {
      const existe = await Entrenamiento.findById(req.params.id).select('_id').lean();
      if (!existe) return res.status(404).json({ error: 'Entrenamiento no encontrado' });

      // En cascada: dejar asistencias huérfanas apuntando a un entrenamiento borrado ensucia
      // el resumen para siempre y nadie las volvería a encontrar para limpiarlas.
      await AsistenciaEntrenamiento.deleteMany({ entrenamiento: req.params.id });
      await Entrenamiento.deleteOne({ _id: req.params.id });

      return res.status(204).send();
    } catch (error) {
      console.error('Error eliminando entrenamiento:', error);
      return res.status(500).json({ error: 'Error al eliminar el entrenamiento' });
    }
  }
);

export default router;
