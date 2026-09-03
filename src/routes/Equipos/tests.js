import express from 'express';
import mongoose from 'mongoose';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import TipoTest from '../../models/Equipo/TipoTest.js';
import ResultadoTest from '../../models/Equipo/ResultadoTest.js';
import Jugador from '../../models/Jugador/Jugador.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import { vigenteEn } from '../../services/jugadoresElegiblesService.js';

const router = express.Router();

/**
 * Tests de evaluación: el catálogo de qué mide cada equipo y las mediciones de sus jugadores.
 *
 * Comparte permisos con entrenamientos (`trainings.manage` para escribir, `stats.view_private`
 * para leer) porque lo hace la misma persona: el entrenador o el preparador físico. Inventar un
 * `tests.manage` sería una tercera jerarquía de permisos para el mismo rol real.
 */

const permisoPorEquipo = (permission) =>
  requireTeamPermission({
    permission,
    resolveEquipoId: (req) => req.query?.equipo ?? req.body?.equipo,
    missingMessage: 'Se requiere el parámetro equipo',
  });

const permisoPorTipo = (permission) =>
  requireTeamPermission({
    permission,
    resolveEquipoId: async (req) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return null;
      const doc = await TipoTest.findById(req.params.id).select('equipo').lean();
      return doc ? String(doc.equipo) : null;
    },
    missingMessage: 'Tipo de test no encontrado',
  });

const nombreDe = (j) => {
  if (!j || typeof j === 'string') return 'Jugador';
  return j.alias || [j.nombre, j.apellido].filter(Boolean).join(' ').trim() || 'Jugador';
};

/**
 * `YYYY-MM-DD` → medianoche UTC de ese día.
 *
 * Un test es del día, no del momento. Guardar la hora rompería el índice único
 * {jugador, tipoTest, fecha}: dos mediciones del mismo día a horas distintas no colisionarían
 * y el jugador quedaría con dos valores para la misma jornada.
 */
const aDia = (valor) => {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00.000Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

// ---------------------------------------------------------------------------- catálogo

/**
 * @swagger
 * /api/tests/tipos:
 *   get:
 *     summary: Catálogo de tests del equipo
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/tipos', verificarToken, cargarRolDesdeBD, permisoPorEquipo('stats.view_private'), async (req, res) => {
  try {
    const incluirArchivados = req.query.archivados === 'true';
    const filtro = { equipo: req.equipoIdPermisos };
    if (!incluirArchivados) filtro.activo = true;

    const tipos = await TipoTest.find(filtro).sort({ nombre: 1 }).lean();
    return res.json({ tipos: tipos.map((t) => ({ ...t, _id: String(t._id), equipo: String(t.equipo) })) });
  } catch (error) {
    console.error('Error listando tipos de test:', error);
    return res.status(500).json({ error: 'Error al listar los tipos de test' });
  }
});

/**
 * @swagger
 * /api/tests/tipos:
 *   post:
 *     summary: Crea un tipo de test para el equipo
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/tipos', verificarToken, cargarRolDesdeBD, permisoPorEquipo('trainings.manage'), async (req, res) => {
  try {
    const { nombre, unidad, mejorEs, decimales, descripcion } = req.body ?? {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre del test es obligatorio' });
    }

    const tipo = await TipoTest.create({
      equipo: req.equipoIdPermisos,
      nombre: String(nombre).trim(),
      unidad,
      mejorEs,
      decimales,
      descripcion,
      creadoPor: req.user.uid,
    });

    return res.status(201).json({ ...tipo.toObject(), _id: String(tipo._id) });
  } catch (error) {
    // El índice único {equipo, nombre} es lo que evita dos tests indistinguibles en la lista.
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un test con ese nombre en este equipo' });
    }
    console.error('Error creando tipo de test:', error);
    return res.status(500).json({ error: 'Error al crear el tipo de test' });
  }
});

/**
 * @swagger
 * /api/tests/tipos/{id}:
 *   put:
 *     summary: Edita o archiva un tipo de test
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/tipos/:id', validarObjectId, verificarToken, cargarRolDesdeBD, permisoPorTipo('trainings.manage'), async (req, res) => {
  try {
    const permitidos = ['nombre', 'unidad', 'mejorEs', 'decimales', 'descripcion', 'activo'];
    const cambios = {};
    for (const campo of permitidos) {
      if (req.body?.[campo] !== undefined) cambios[campo] = req.body[campo];
    }

    const tipo = await TipoTest.findByIdAndUpdate(req.params.id, { $set: cambios }, {
      new: true,
      runValidators: true,
    }).lean();

    if (!tipo) return res.status(404).json({ error: 'Tipo de test no encontrado' });
    return res.json({ ...tipo, _id: String(tipo._id) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un test con ese nombre en este equipo' });
    }
    console.error('Error editando tipo de test:', error);
    return res.status(500).json({ error: 'Error al editar el tipo de test' });
  }
});

/**
 * @swagger
 * /api/tests/tipos/{id}:
 *   delete:
 *     summary: Elimina un tipo de test sin mediciones; si las tiene, lo archiva
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/tipos/:id', validarObjectId, verificarToken, cargarRolDesdeBD, permisoPorTipo('trainings.manage'), async (req, res) => {
  try {
    const medidas = await ResultadoTest.countDocuments({ tipoTest: req.params.id });

    /**
     * Con mediciones cargadas NO se borra: se archiva. Borrar el tipo dejaría los resultados
     * históricos huérfanos —números sin nombre ni unidad, o sea basura— y esa serie es
     * justamente lo que hace valioso al test. Archivar lo saca de los desplegables sin tocar
     * lo ya medido.
     */
    if (medidas > 0) {
      await TipoTest.findByIdAndUpdate(req.params.id, { $set: { activo: false } });
      return res.json({
        archivado: true,
        mediciones: medidas,
        mensaje: 'El test tiene mediciones cargadas, así que se archivó en vez de borrarse.',
      });
    }

    const borrado = await TipoTest.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: 'Tipo de test no encontrado' });
    return res.status(204).send();
  } catch (error) {
    console.error('Error eliminando tipo de test:', error);
    return res.status(500).json({ error: 'Error al eliminar el tipo de test' });
  }
});

// ---------------------------------------------------------------------------- mediciones

/**
 * @swagger
 * /api/tests/resultados:
 *   get:
 *     summary: Mediciones del equipo, opcionalmente filtradas por test o jugador
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/resultados', verificarToken, cargarRolDesdeBD, permisoPorEquipo('stats.view_private'), async (req, res) => {
  try {
    const filtro = { equipo: req.equipoIdPermisos };
    if (mongoose.Types.ObjectId.isValid(req.query.tipoTest)) filtro.tipoTest = req.query.tipoTest;
    if (mongoose.Types.ObjectId.isValid(req.query.jugador)) filtro.jugador = req.query.jugador;

    const resultados = await ResultadoTest.find(filtro)
      .populate('jugador', 'nombre apellido alias')
      .sort({ fecha: 1 })
      .lean();

    return res.json({
      resultados: resultados.map((r) => ({
        _id: String(r._id),
        jugadorId: String(r.jugador?._id ?? r.jugador),
        jugador: nombreDe(r.jugador),
        tipoTestId: String(r.tipoTest),
        // Sólo la parte de día: se guarda a medianoche UTC y devolver el ISO completo invita a
        // que el cliente lo pase por su zona horaria y lo corra un día.
        fecha: r.fecha.toISOString().slice(0, 10),
        valor: r.valor,
        notas: r.notas ?? '',
        entrenamiento: r.entrenamiento ? String(r.entrenamiento) : null,
      })),
    });
  } catch (error) {
    console.error('Error listando resultados de test:', error);
    return res.status(500).json({ error: 'Error al listar las mediciones' });
  }
});

/**
 * @swagger
 * /api/tests/resultados:
 *   put:
 *     summary: Carga o corrige mediciones en lote
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/resultados', verificarToken, cargarRolDesdeBD, permisoPorEquipo('trainings.manage'), async (req, res) => {
  try {
    const { tipoTest, fecha, entrenamiento, resultados } = req.body ?? {};

    if (!mongoose.Types.ObjectId.isValid(tipoTest)) {
      return res.status(400).json({ error: 'tipoTest inválido' });
    }
    const dia = aDia(fecha);
    if (!dia) return res.status(400).json({ error: 'fecha debe tener el formato YYYY-MM-DD' });

    const tipo = await TipoTest.findOne({ _id: tipoTest, equipo: req.equipoIdPermisos }).select('_id').lean();
    if (!tipo) return res.status(404).json({ error: 'Ese test no pertenece a este equipo' });

    const filas = Array.isArray(resultados) ? resultados : [];
    const operaciones = [];
    const aBorrar = [];

    for (const fila of filas) {
      if (!mongoose.Types.ObjectId.isValid(fila?.jugadorId)) continue;

      // Valor vacío = "a este jugador no se lo midió". Se borra la fila en vez de guardar un
      // cero, que en un test es un valor legítimo y muy distinto de "no hay dato".
      const crudo = fila?.valor;
      if (crudo === '' || crudo === null || crudo === undefined) {
        aBorrar.push(fila.jugadorId);
        continue;
      }

      const valor = Number(crudo);
      if (!Number.isFinite(valor)) continue;

      operaciones.push({
        updateOne: {
          filter: { jugador: fila.jugadorId, tipoTest, fecha: dia },
          update: {
            $set: {
              equipo: req.equipoIdPermisos,
              valor,
              notas: typeof fila.notas === 'string' ? fila.notas : '',
              entrenamiento: mongoose.Types.ObjectId.isValid(entrenamiento) ? entrenamiento : null,
            },
            $setOnInsert: { creadoPor: req.user.uid },
          },
          upsert: true,
        },
      });
    }

    if (operaciones.length > 0) {
      await ResultadoTest.bulkWrite(operaciones, { ordered: false });
    }
    if (aBorrar.length > 0) {
      await ResultadoTest.deleteMany({ tipoTest, fecha: dia, jugador: { $in: aBorrar } });
    }

    return res.json({ ok: true, guardadas: operaciones.length, borradas: aBorrar.length });
  } catch (error) {
    console.error('Error guardando mediciones:', error);
    return res.status(500).json({ error: 'Error al guardar las mediciones' });
  }
});

/**
 * @swagger
 * /api/tests/evolucion:
 *   get:
 *     summary: Serie de cada jugador en cada test, con su progreso
 *     tags: [Tests]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/evolucion', verificarToken, cargarRolDesdeBD, permisoPorEquipo('stats.view_private'), async (req, res) => {
  try {
    const equipoId = req.equipoIdPermisos;

    const [tipos, resultados, contratos] = await Promise.all([
      TipoTest.find({ equipo: equipoId }).lean(),
      ResultadoTest.find({ equipo: equipoId }).sort({ fecha: 1 }).lean(),
      JugadorEquipo.find({ equipo: equipoId, estado: 'aceptado' }).select('jugador desde hasta').lean(),
    ]);

    // El plantel de hoy: la pregunta es "cómo vienen mis jugadores", no el archivo histórico.
    const hoy = new Date();
    const delPlantel = [
      ...new Set(contratos.filter((c) => vigenteEn(c, hoy)).map((c) => String(c.jugador))),
    ];
    const fichas = await Jugador.find({ _id: { $in: delPlantel } }).select('nombre apellido alias').lean();
    const nombrePorId = new Map(fichas.map((j) => [String(j._id), nombreDe(j)]));

    const tipoPorId = new Map(tipos.map((t) => [String(t._id), t]));
    const series = new Map();

    for (const r of resultados) {
      const jugadorId = String(r.jugador);
      if (!nombrePorId.has(jugadorId)) continue;
      const clave = `${jugadorId}|${String(r.tipoTest)}`;
      const lista = series.get(clave) ?? [];
      lista.push({ fecha: r.fecha.toISOString().slice(0, 10), valor: r.valor });
      series.set(clave, lista);
    }

    const salida = [];
    for (const [clave, mediciones] of series.entries()) {
      const [jugadorId, tipoTestId] = clave.split('|');
      const tipo = tipoPorId.get(tipoTestId);
      if (!tipo) continue;

      const primera = mediciones[0];
      const ultima = mediciones[mediciones.length - 1];
      const delta = ultima.valor - primera.valor;

      /**
       * Si el cambio es una mejora depende de `mejorEs`, no del signo. Bajar de 2.1 a 1.9
       * segundos en un sprint es progresar; bajar en salto vertical es lo contrario. Devolver
       * sólo el delta obligaría a cada cliente a repetir esta decisión, y basta con que uno la
       * repita mal para mostrar una flecha verde sobre un empeoramiento.
       */
      let mejoro = null;
      if (mediciones.length > 1 && delta !== 0 && tipo.mejorEs !== 'neutro') {
        mejoro = tipo.mejorEs === 'menor' ? delta < 0 : delta > 0;
      }

      salida.push({
        jugadorId,
        jugador: nombrePorId.get(jugadorId),
        tipoTestId,
        tipoTest: tipo.nombre,
        unidad: tipo.unidad ?? '',
        decimales: tipo.decimales ?? 1,
        mediciones,
        primera: primera.valor,
        ultima: ultima.valor,
        delta,
        mejoro,
      });
    }

    salida.sort(
      (a, b) => a.tipoTest.localeCompare(b.tipoTest, 'es') || a.jugador.localeCompare(b.jugador, 'es')
    );

    return res.json({ evolucion: salida });
  } catch (error) {
    console.error('Error armando la evolución de tests:', error);
    return res.status(500).json({ error: 'Error al armar la evolución' });
  }
});

export default router;
