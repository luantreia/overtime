import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import Entrenamiento from '../../models/Equipo/Entrenamiento.js';
import AsistenciaEntrenamiento from '../../models/Equipo/AsistenciaEntrenamiento.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import Jugador from '../../models/Jugador/Jugador.js';
import { vigenteEn } from '../../services/jugadoresElegiblesService.js';

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
 * Los jugadores con contrato vigente en una fecha dada, sin repetidos.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * 1. La referencia temporal es la fecha DEL ENTRENAMIENTO, no `new Date()`. Cargar en marzo la
 *    asistencia de un entrenamiento de enero tiene que convocar al plantel de enero, no al de
 *    hoy. Es la misma regla que ya usa la convocatoria de un partido, y por eso comparten el
 *    helper `vigenteEn` en vez de tener cada una su copia.
 *
 * 2. Se deduplica por jugador. No hay índice único {jugador, equipo} en JugadorEquipo: un
 *    jugador que se fue y volvió tiene DOS contratos aceptados. Sin este `Set`, el insertMany
 *    de la convocatoria chocaba contra el índice único {entrenamiento, jugador} y la creación
 *    entera fallaba con un 500 — que es exactamente el error que se veía al crear.
 */
const plantelVigenteEn = async (equipoId, fecha) => {
  const contratos = await JugadorEquipo.find({ equipo: equipoId, estado: 'aceptado' })
    .select('jugador desde hasta')
    .lean();

  const vigentes = contratos.filter((c) => vigenteEn(c, fecha));
  return [...new Set(vigentes.map((c) => String(c.jugador)))];
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
        .select('entrenamiento estado respuesta')
        .lean();

      const conteos = new Map();
      const respuestas = new Map();
      for (const a of asistencias) {
        const clave = String(a.entrenamiento);
        const acc = conteos.get(clave) ?? { convocado: 0, presente: 0, tarde: 0, ausente: 0, justificado: 0 };
        acc[a.estado] = (acc[a.estado] ?? 0) + 1;
        conteos.set(clave, acc);
        // Aparte del recuento de asistencia: lo que anticiparon los jugadores ("voy / no voy").
        const r = respuestas.get(clave) ?? { voy: 0, no_voy: 0 };
        if (a.respuesta === 'voy' || a.respuesta === 'no_voy') r[a.respuesta] += 1;
        respuestas.set(clave, r);
      }

      return res.json({
        entrenamientos: entrenamientos.map((e) => ({
          ...e,
          _id: String(e._id),
          equipo: String(e.equipo),
          respuestas: respuestas.get(String(e._id)) ?? { voy: 0, no_voy: 0 },
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

      // El resumen es sobre el plantel de HOY: es la pregunta "cómo viene mi equipo", no el
      // archivo histórico. Los que ya no están quedan afuera, aunque tengan asistencias viejas.
      const jugadorIds = await plantelVigenteEn(equipoId, new Date());
      const fichas = await Jugador.find({ _id: { $in: jugadorIds } })
        .select('nombre apellido alias')
        .lean();

      const vacio = (j) => ({
        jugadorId: String(j._id),
        jugador: nombreDe(j),
        presente: 0,
        tarde: 0,
        ausente: 0,
        justificado: 0,
        convocado: 0,
      });

      if (entrenamientos.length === 0) {
        return res.json({
          totalEntrenamientos: 0,
          jugadores: fichas.map((j) => ({ ...vacio(j), porcentaje: null })),
        });
      }

      const asistencias = await AsistenciaEntrenamiento.find({
        entrenamiento: { $in: entrenamientos.map((e) => e._id) },
      })
        .select('jugador estado')
        .lean();

      const porJugador = new Map(fichas.map((j) => [String(j._id), vacio(j)]));

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
 * Lado del JUGADOR. Todo lo de arriba es para el staff (pide permisos de equipo); estas dos
 * rutas resuelven al jugador desde el token (`Jugador.userId`) y sólo dejan ver/responder los
 * entrenamientos de equipos donde tiene contrato vigente a la fecha de la sesión — la misma
 * regla con la que se lo convoca, así que "me convocaron" y "puedo responder" no divergen.
 */
const RESPUESTAS = new Set(['sin_respuesta', 'voy', 'no_voy']);

/**
 * @swagger
 * /api/entrenamientos/mios:
 *   get:
 *     summary: Entrenamientos de los equipos del jugador logueado, con su respuesta y asistencia
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/mios', verificarToken, async (req, res) => {
  try {
    const jugador = await Jugador.findOne({ userId: req.user.uid }).select('_id').lean();
    if (!jugador) return res.json({ entrenamientos: [] });

    const contratos = await JugadorEquipo.find({ jugador: jugador._id, estado: 'aceptado' })
      .select('equipo desde hasta')
      .lean();
    if (contratos.length === 0) return res.json({ entrenamientos: [] });

    // Por defecto: desde hace 30 días. Lo pasado reciente sirve para ver "cómo me marcaron".
    const d = req.query.desde ? new Date(req.query.desde) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const desde = Number.isNaN(d.getTime()) ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : d;

    const equipoIds = [...new Set(contratos.map((c) => String(c.equipo)))];
    const candidatos = await Entrenamiento.find({ equipo: { $in: equipoIds }, fecha: { $gte: desde } })
      .populate('equipo', 'nombre escudo')
      .sort({ fecha: 1 })
      .lean();

    const propios = candidatos.filter((e) =>
      contratos.some((c) => String(c.equipo) === String(e.equipo?._id ?? e.equipo) && vigenteEn(c, e.fecha))
    );
    if (propios.length === 0) return res.json({ entrenamientos: [] });

    const filas = await AsistenciaEntrenamiento.find({
      entrenamiento: { $in: propios.map((e) => e._id) },
      jugador: jugador._id,
    }).lean();
    const filaPor = new Map(filas.map((f) => [String(f.entrenamiento), f]));

    return res.json({
      entrenamientos: propios.map((e) => {
        const f = filaPor.get(String(e._id));
        return {
          _id: String(e._id),
          fecha: e.fecha,
          duracionMinutos: e.duracionMinutos,
          lugar: e.lugar,
          tipo: e.tipo,
          titulo: e.titulo,
          estado: e.estado,
          equipo: e.equipo ? { _id: String(e.equipo._id), nombre: e.equipo.nombre, escudo: e.equipo.escudo } : null,
          respuesta: f?.respuesta ?? 'sin_respuesta',
          respuestaMotivo: f?.respuestaMotivo ?? '',
          asistencia: f?.estado ?? 'convocado',
        };
      }),
    });
  } catch (error) {
    console.error('Error listando entrenamientos del jugador:', error);
    return res.status(500).json({ error: 'Error al listar tus entrenamientos' });
  }
});

/**
 * @swagger
 * /api/entrenamientos/{id}/respuesta:
 *   put:
 *     summary: El jugador logueado responde si va o no a un entrenamiento
 *     tags: [Entrenamientos]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/respuesta', validarObjectId, verificarToken, async (req, res) => {
  try {
    const { respuesta, motivo } = req.body ?? {};
    if (!RESPUESTAS.has(respuesta)) {
      return res.status(400).json({ error: "respuesta debe ser 'voy', 'no_voy' o 'sin_respuesta'" });
    }

    const jugador = await Jugador.findOne({ userId: req.user.uid }).select('_id').lean();
    if (!jugador) return res.status(403).json({ error: 'Tu usuario no tiene una ficha de jugador' });

    const entrenamiento = await Entrenamiento.findById(req.params.id).select('equipo fecha estado').lean();
    if (!entrenamiento) return res.status(404).json({ error: 'Entrenamiento no encontrado' });

    // Responder es anticipar: una vez que la sesión pasó (o el staff ya cargó asistencia) la
    // respuesta deja de significar algo y sólo serviría para "corregir" lo que pasó.
    if (entrenamiento.estado !== 'programado' || new Date(entrenamiento.fecha) < new Date()) {
      return res.status(409).json({ error: 'Este entrenamiento ya no admite respuestas' });
    }

    const plantel = await plantelVigenteEn(entrenamiento.equipo, entrenamiento.fecha);
    if (!plantel.includes(String(jugador._id))) {
      return res.status(403).json({ error: 'No estás en el plantel de este entrenamiento' });
    }

    // upsert: quien se sumó al plantel después de creado el entrenamiento no tiene fila todavía.
    // `estado` no se toca: lo sigue decidiendo el staff.
    await AsistenciaEntrenamiento.updateOne(
      { entrenamiento: entrenamiento._id, jugador: jugador._id },
      {
        $set: {
          respuesta,
          respuestaMotivo: respuesta === 'no_voy' && typeof motivo === 'string' ? motivo.slice(0, 200) : '',
          respondidoEn: respuesta === 'sin_respuesta' ? null : new Date(),
        },
      },
      { upsert: true, runValidators: true }
    );

    return res.json({ ok: true, respuesta });
  } catch (error) {
    console.error('Error guardando respuesta de entrenamiento:', error);
    return res.status(500).json({ error: 'Error al guardar tu respuesta' });
  }
});

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

      // Convocar al plantel por defecto: lo normal es que entrenen todos, y marcar las
      // excepciones es mucho menos trabajo que cargar veinte jugadores a mano cada vez.
      //
      // El try/catch NO es decorativo. El entrenamiento ya está creado en este punto: si la
      // convocatoria falla y dejamos propagar el error, el cliente recibe un 500 y cree que no
      // se creó nada, cuando en realidad quedó guardado. Eso es exactamente lo que pasaba y por
      // eso aparecían entrenamientos "fantasma" después de un error. Convocar es un extra
      // conveniente, no parte del contrato de crear.
      let convocados = 0;
      let avisoConvocatoria = null;
      if (convocarPlantel) {
        try {
          const jugadorIds = await plantelVigenteEn(equipoId, cuando);
          if (jugadorIds.length > 0) {
            await AsistenciaEntrenamiento.insertMany(
              jugadorIds.map((jugador) => ({ entrenamiento: entrenamiento._id, jugador })),
              { ordered: false }
            );
          }
          convocados = jugadorIds.length;
        } catch (error) {
          console.error('Entrenamiento creado pero falló la convocatoria automática:', error);
          avisoConvocatoria =
            'El entrenamiento se creó, pero no pudimos convocar al plantel automáticamente. Podés marcar la asistencia a mano.';
        }
      }

      return res.status(201).json({
        ...entrenamiento.toObject(),
        _id: String(entrenamiento._id),
        convocados,
        aviso: avisoConvocatoria,
      });
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

      /**
       * La lista que se devuelve es el plantel vigente A LA FECHA DEL ENTRENAMIENTO, no las
       * filas que haya en la base.
       *
       * Se hace así por dos motivos. Uno: los entrenamientos creados antes de que existiera el
       * filtro por fecha tienen filas de jugadores que ya no estaban en el equipo, y sin esto
       * seguirían apareciendo para siempre. Dos: un jugador que se sumó al plantel después de
       * crear el entrenamiento no tiene fila, y tiene que poder marcarse igual — el guardado
       * hace upsert justamente para eso.
       */
      const delPlantel = new Set(await plantelVigenteEn(entrenamiento.equipo, entrenamiento.fecha));
      const porJugador = new Map(asistencias.map((a) => [String(a.jugador?._id ?? a.jugador), a]));

      // Se necesitan los nombres de quienes están en el plantel pero todavía no tienen fila.
      const sinFila = [...delPlantel].filter((id) => !porJugador.has(id));
      const fichasFaltantes = sinFila.length
        ? await Jugador.find({ _id: { $in: sinFila } }).select('nombre apellido alias').lean()
        : [];
      const fichaPorId = new Map(fichasFaltantes.map((j) => [String(j._id), j]));

      const filas = [...delPlantel].map((jugadorId) => {
        const a = porJugador.get(jugadorId);
        return {
          _id: a ? String(a._id) : null,
          jugadorId,
          jugador: nombreDe(a?.jugador ?? fichaPorId.get(jugadorId)),
          estado: a?.estado ?? 'convocado',
          minutosTarde: a?.minutosTarde ?? 0,
          notas: a?.notas ?? '',
          respuesta: a?.respuesta ?? 'sin_respuesta',
          respuestaMotivo: a?.respuestaMotivo ?? '',
        };
      });

      return res.json({
        ...entrenamiento,
        _id: String(entrenamiento._id),
        equipo: String(entrenamiento.equipo),
        asistencias: filas.sort((a, b) => a.jugador.localeCompare(b.jugador, 'es')),
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

      /**
       * Lo que se guarda ES la lista: se borran las filas de jugadores que no vinieron en el
       * payload.
       *
       * Sin esto, un entrenamiento creado antes del filtro por fecha conserva para siempre
       * filas de gente que ya no está en el equipo. No se ven en la pantalla de asistencia
       * (que muestra el plantel vigente) pero sí cuentan en el "12/15" de la lista, y ese
       * desacuerdo entre dos pantallas es peor que el dato de más. Guardar la asistencia
       * repara el entrenamiento de paso.
       */
      const idsEnviados = filas
        .map((f) => f?.jugadorId)
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

      await AsistenciaEntrenamiento.deleteMany({
        entrenamiento: req.params.id,
        jugador: { $nin: idsEnviados },
      });

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
