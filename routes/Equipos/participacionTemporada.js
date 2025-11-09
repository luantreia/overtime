import express from 'express';
import mongoose from 'mongoose';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import Equipo from '../../models/Equipo/Equipo.js';
import EquipoCompetencia from '../../models/Equipo/EquipoCompetencia.js';
import Temporada from '../../models/Competencia/Temporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { crearEquipoCompetenciaAuto } from '../../services/equipoCompetenciaService.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import ParticipacionFase from '../../models/Equipo/ParticipacionFase.js';
import Fase from '../../models/Competencia/Fase.js';

const router = express.Router();
const { Types } = mongoose;

function validarCamposManual(req, res, next) {
  const { temporada, equipo } = req.query;

  // Validar ObjectId en query params si están presentes
  if (temporada && !Types.ObjectId.isValid(temporada)) {
    return res.status(400).json({ message: 'temporada inválida' });
  }
  if (equipo && !Types.ObjectId.isValid(equipo)) {
    return res.status(400).json({ message: 'equipo inválido' });
  }

  // Solo validar body si existe (en POST/PUT)
  if (req.body) {
    if (req.body.equipo && !Types.ObjectId.isValid(req.body.equipo)) {
      return res.status(400).json({ message: 'equipo inválido' });
    }
    if (req.body.temporada && !Types.ObjectId.isValid(req.body.temporada)) {
      return res.status(400).json({ message: 'temporada inválida' });
    }
    const estadosValidos = ['activo', 'baja', 'expulsado'];
    if (req.body.estado && !estadosValidos.includes(req.body.estado)) {
      return res.status(400).json({ message: 'estado inválido' });
    }
    if (req.body.observaciones && typeof req.body.observaciones !== 'string') {
      return res.status(400).json({ message: 'observaciones debe ser texto' });
    }
    if (req.body.observaciones && req.body.observaciones.length > 500) {
      return res.status(400).json({ message: 'observaciones demasiado largo' });
    }
  }

  next();
}

// GET /api/participacion-temporada?temporada=&equipo=
/**
 * @swagger
 * /api/participacion-temporada:
 *   get:
 *     summary: Lista participaciones de equipos en temporadas
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: temporada
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de participaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParticipacionTemporada'
 *       400:
 *         description: Parámetros inválidos
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/', verificarToken, validarCamposManual, async (req, res) => {
  try {
    const { temporada, equipo } = req.query;
    const filtro = {};
    if (temporada) filtro.temporada = temporada;
    if (equipo) filtro.equipo = equipo;

    const participaciones = await ParticipacionTemporada.find(filtro)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email')
      .sort('-createdAt');

    res.json(participaciones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener participaciones', error: err.message });
  }
});

// GET /api/participacion-temporada/opciones
// Devuelve:
// - Si se pasa ?temporada=ID: equipos disponibles para esa temporada (no participando aún)
//   Opcional: q para buscar por nombre; soloMisEquipos=true para limitar a equipos administrados por el usuario (o todos si rol=admin)
// - Si se pasa ?equipo=ID: temporadas disponibles para ese equipo (no participando aún)
//   Opcional: q para buscar por nombre de temporada
/**
 * @swagger
 * /api/participacion-temporada/opciones:
 *   get:
 *     summary: Opciones disponibles para crear participaciones
 *     description: Si se pasa temporada devuelve equipos disponibles. Si se pasa equipo devuelve temporadas disponibles. Permisos aplican.
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: temporada
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: soloMisEquipos
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista de opciones
 *       400:
 *         description: Parámetros inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const { temporada, equipo, q, soloMisEquipos } = req.query;
    const uid = req.user?.uid;
    const rol = (req.user?.rol || '').toLowerCase?.() || 'lector';

    if ((temporada && equipo) || (!temporada && !equipo)) {
      return res.status(400).json({ message: 'Debe indicar temporada o equipo (solo uno)' });
    }

    // Equipos disponibles para una temporada
    if (temporada) {
      if (!Types.ObjectId.isValid(temporada)) return res.status(400).json({ message: 'temporada inválida' });

      // Equipos ya participantes
      const part = await ParticipacionTemporada.find({ temporada }).select('equipo').lean();
      const ocupados = new Set(part.map(p => p.equipo?.toString()));

      // Filtro base de equipos
      const filtroEquipos = { _id: { $nin: Array.from(ocupados) } };
      if (q) {
        const regex = new RegExp(q, 'i');
        filtroEquipos.$or = [{ nombre: regex }, { tipo: regex }, { pais: regex }];
      }

      // Limitar a mis equipos si se solicita y el usuario no es admin global
      const limitarMisEquipos = String(soloMisEquipos).toLowerCase() === 'true' || soloMisEquipos === '1';
      if (limitarMisEquipos && rol !== 'admin') {
        filtroEquipos.$or = [
          ...(filtroEquipos.$or || []),
          { creadoPor: uid },
          { administradores: uid },
        ];
      }

      const equiposDisponibles = await Equipo.find(filtroEquipos)
        .select('nombre escudo tipo pais')
        .sort({ nombre: 1 })
        .limit(50)
        .lean();

      const opciones = equiposDisponibles.map(e => ({ _id: e._id, nombre: e.nombre, escudo: e.escudo, tipo: e.tipo, pais: e.pais }));
      return res.json(opciones);
    }

    // Temporadas disponibles para un equipo
    if (!Types.ObjectId.isValid(equipo)) return res.status(400).json({ message: 'equipo inválido' });

    // Validar permisos: sólo admin del equipo o admin global
    const eq = await Equipo.findById(equipo).select('creadoPor administradores').lean();
    if (!eq) return res.status(404).json({ message: 'Equipo no encontrado' });
    const esAdminEquipo = rol === 'admin' || eq.creadoPor?.toString() === uid || (eq.administradores || []).map(id => id?.toString?.()).includes(uid);
    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

    const existentes = await ParticipacionTemporada.find({ equipo }).select('temporada').lean();
    const ocupadas = new Set(existentes.map(p => p.temporada?.toString()));

    const filtroTemporadas = { _id: { $nin: Array.from(ocupadas) } };
    if (q) {
      const regex = new RegExp(q, 'i');
      filtroTemporadas.$or = [{ nombre: regex }];
    }

    const temporadasDisponibles = await Temporada.find(filtroTemporadas)
      .select('nombre fechaInicio fechaFin competencia')
      .sort({ fechaInicio: -1 })
      .limit(50)
      .lean();

    const opcionesTemp = temporadasDisponibles.map(t => ({ _id: t._id, nombre: t.nombre, fechaInicio: t.fechaInicio, fechaFin: t.fechaFin, competencia: t.competencia }));
    return res.json(opcionesTemp);
  } catch (err) {
    console.error('Error en GET /participacion-temporada/opciones:', err);
    res.status(500).json({ message: 'Error al obtener opciones', error: err.message });
  }
});


// GET /api/participacion-temporada/:id
/**
 * @swagger
 * /api/participacion-temporada/{id}:
 *   get:
 *     summary: Obtiene una participación por ID
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Participación encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ParticipacionTemporada'
 *       401:
 *         description: No autorizado
 *       404:
 *         description: No encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionTemporada.findById(req.params.id)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email');

    if (!participacion) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json(participacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al buscar participación', error: err.message });
  }
});


// POST /api/participacion-temporada
/**
 * @swagger
 * /api/participacion-temporada:
 *   post:
 *     summary: Crea una nueva participación
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipo, temporada]
 *             properties:
 *               equipo:
 *                 type: string
 *                 format: ObjectId
 *               temporada:
 *                 type: string
 *                 format: ObjectId
 *               estado:
 *                 type: string
 *                 enum: [activo, baja, expulsado]
 *               observaciones:
 *                 type: string
 *     responses:
 *       201:
 *         description: Creado
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Entidades no encontradas
 *       409:
 *         description: Ya existe participación para ese equipo y temporada
 *       500:
 *         description: Error del servidor
 */
router.post('/', verificarToken, validarCamposManual, async (req, res) => {
  try {
    console.log('POST /participacion-temporada body:', req.body);

    const { equipo, temporada } = req.body;

    if (!equipo || !temporada) {
      return res.status(400).json({ message: 'equipo y temporada son obligatorios' });
    }

    // Validar que equipo y temporada existen
    const [equipoDB, temporadaDB] = await Promise.all([
      Equipo.findById(equipo),
      Temporada.findById(temporada),
    ]);
    if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });

    // Verificar que no exista ya una participación con el mismo equipo-temporada
    const existe = await ParticipacionTemporada.findOne({ equipo, temporada });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una participación para este equipo y temporada' });
    }

    const nueva = new ParticipacionTemporada({
      ...req.body,
      creadoPor: req.user?.uid || 'sistema',
    });

    await nueva.save();

    // Crear automáticamente la relación en EquipoCompetencia y ParticipacionesFase
    if (temporadaDB.competencia) {
      try {
        const nuevoEC = await crearEquipoCompetenciaAuto({
          equipo,
          competencia: temporadaDB.competencia,
          creadoPor: req.user?.uid || 'sistema',
        });
        console.log('EquipoCompetencia creado automáticamente:', nuevoEC._id);

        // Obtener todas las fases de esa competencia
        const fases = await Fase.find({ competencia: temporadaDB.competencia });

        // Crear ParticipacionesFase para cada fase
        const promesasParticipacionesFase = fases.map(fase => {
          const participacionFase = new ParticipacionFase({
            participacionTemporada: nueva._id,
            fase: fase._id,
            // Aquí podés agregar lógica para grupo y división si aplica
          });
          return participacionFase.save();
        });

        const participacionesFaseCreadas = await Promise.all(promesasParticipacionesFase);
        console.log(`Se crearon ${participacionesFaseCreadas.length} participaciones en fases automáticamente.`);

      } catch (ecErr) {
        console.warn('No se pudo crear EquipoCompetencia o ParticipacionesFase:', ecErr.message);
      }
    }

    // Finalmente responder con la nueva ParticipacionTemporada creada
    res.status(201).json(nueva);

  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al crear participación', error: err.message });
  }
});

// PUT /api/participacion-temporada/:id
/**
 * @swagger
 * /api/participacion-temporada/{id}:
 *   put:
 *     summary: Actualiza una participación existente
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParticipacionTemporada'
 *     responses:
 *       200:
 *         description: Actualizado
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', verificarToken, validarObjectId, validarCamposManual, async (req, res) => {
  try {
    const item = await ParticipacionTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Participación no encontrada' });

    // Si actualizan equipo o temporada validar que existan
    if (req.body.equipo) {
      const equipoDB = await Equipo.findById(req.body.equipo);
      if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    }
    if (req.body.temporada) {
      const temporadaDB = await Temporada.findById(req.body.temporada);
      if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });
    }

    // Actualizar
    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al actualizar participación', error: err.message });
  }
});

// DELETE /api/participacion-temporada/:id
/**
 * @swagger
 * /api/participacion-temporada/{id}:
 *   delete:
 *     summary: Elimina una participación
 *     tags: [ParticipacionTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Eliminado
 *       401:
 *         description: No autorizado
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const eliminada = await ParticipacionTemporada.findByIdAndDelete(req.params.id);
    if (!eliminada) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json({ message: 'Participación eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar participación', error: err.message });
  }
});

export default router;
